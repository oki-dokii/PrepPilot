from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.models import User
from app.core.config import settings

router = APIRouter()

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class ChatResponse(BaseModel):
    reply: Optional[str] = None
    is_ready: bool
    test_blueprint: Optional[Dict[str, Any]] = None

@router.post("/setup-test", response_model=ChatResponse)
async def setup_test(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        if not settings.GEMINI_API_KEY:
            # Fallback if no API key is provided
            return ChatResponse(
                reply="I'm running in offline mode without an API key. I will generate a standard test for you now.",
                is_ready=True,
                test_blueprint={
                    "duration_minutes": 90,
                    "blueprint": [
                        {"type": "mcq", "topic": "DSA", "difficulty": "medium"},
                        {"type": "mcq", "topic": "OS", "difficulty": "medium"},
                        {"type": "mcq", "topic": "CN", "difficulty": "medium"},
                        {"type": "coding", "topic": "DSA", "difficulty": "easy"},
                        {"type": "coding", "topic": "DSA", "difficulty": "medium"}
                    ]
                }
            )

        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)

        from sqlalchemy import select
        from app.models.models import MasteryNode
        
        res = await db.execute(select(MasteryNode).where(MasteryNode.user_id == current_user.id))
        nodes = res.scalars().all()
        # Safeguard against None
        for n in nodes:
            if n.mastery_score is None:
                n.mastery_score = 0.5
                
        nodes.sort(key=lambda n: n.mastery_score)
        weak_topics = [n.topic for n in nodes if n.mastery_score < 0.8][:3]
        weak_topics_str = ", ".join(weak_topics) if weak_topics else "None identified yet"

        # Build adaptive difficulty hints based on mastery levels
        difficulty_hints = []
        for n in nodes:
            if n.mastery_score >= 0.80:
                difficulty_hints.append(f"{n.topic}: recommend HARD problems (mastery {round(n.mastery_score*100)}%)")
            elif n.mastery_score >= 0.50:
                difficulty_hints.append(f"{n.topic}: recommend MEDIUM problems (mastery {round(n.mastery_score*100)}%)")
            elif n.mastery_score > 0:
                difficulty_hints.append(f"{n.topic}: recommend EASY problems (mastery {round(n.mastery_score*100)}%)")
        diff_hints_str = ", ".join(difficulty_hints[:5]) if difficulty_hints else "No data yet - use requested difficulty"

        system_instruction = f"""You are an expert technical interview coordinator for PrepPilot.
Your goal is to understand the user's interview situation (Target Company, Role, Seniority, Weak Topics) through a concise conversation.
Ask 1 or 2 targeted questions at a time to gather this info.
Once you have enough information, decide the EXACT blueprint of the test based on what that company typically asks.
For example, Google L4 might have 2 hard algorithmic coding questions and 0 MCQs. A backend infra role might have MCQs on OS/CN and a coding problem on Graphs.

IMPORTANT BACKGROUND: The system has automatically identified the user's weakest topics based on past performance: {weak_topics_str}.
You SHOULD suggest incorporating these weak topics into the generated test blueprint to help them improve, but always confirm with the user.

ADAPTIVE DIFFICULTY CONTEXT: Based on mastery scores, calibrate difficulty per topic: {diff_hints_str}.
When generating the blueprint, use these difficulty recommendations unless the user overrides them.

When you need more information, reply with a normal conversational response.
When you are ready to generate the test, reply ONLY with a JSON object in this exact format (do NOT include markdown formatting or backticks around the JSON):
{{
  "ready": true,
  "duration_minutes": 90,
  "blueprint": [
    {{"type": "mcq", "topic": "DSA", "difficulty": "medium"}},
    {{"type": "coding", "topic": "Graphs", "difficulty": "hard"}}
  ]
}}

CRITICAL RULES FOR THE TOPIC FIELD:
- Use ONLY broad categorical names. Allowed values: DSA, Arrays, Strings, Trees, Graphs, DP, Linked Lists, Sorting, Networking, CN, OS, DBMS, OOPs, System Design, Frontend, React, SQL, etc.
- Do NOT describe the actual question scenario or give hints about the specific problem.
- For example, use "Graphs" NOT "Find shortest path in a weighted directed graph".
"""

        model = genai.GenerativeModel(
            model_name="gemini-flash-lite-latest",
            system_instruction=system_instruction
        )

        # Convert history into Gemini format, ensuring it starts with a 'user' role
        history = []

        # Find the first user message
        start_idx = 0
        while start_idx < len(req.messages) - 1 and req.messages[start_idx].role != "user":
            start_idx += 1

        for m in req.messages[start_idx:-1]:
            history.append({
                "role": "user" if m.role == "user" else "model",
                "parts": [m.content]
            })

        chat = model.start_chat(history=history)

        response = chat.send_message(req.messages[-1].content)
        text = response.text.strip()

        # Strip markdown json block if model accidentally adds it
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        # Check if it's JSON
        if text.startswith("{") and text.endswith("}"):
            try:
                data = json.loads(text)
                if data.get("ready"):
                    # Build a human-readable summary for the reply
                    bp = data.get("blueprint", [])
                    lines = []
                    for i, item in enumerate(bp):
                        q_type = "MCQ" if item["type"] == "mcq" else "Coding"
                        lines.append(f"  {i+1}. {q_type} · {item['topic']} · {item['difficulty'].capitalize()}")
                    summary = "\n".join(lines)
                    reply = f"Here's the test blueprint I've designed for you:\n\n{summary}\n\nDoes this look good? You can ask me to make changes, or confirm to start."
                    return ChatResponse(
                        is_ready=True,
                        reply=reply,
                        test_blueprint=data
                    )
            except json.JSONDecodeError:
                pass

        return ChatResponse(
            is_ready=False,
            reply=text
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"LLM Error: {str(e)}")
