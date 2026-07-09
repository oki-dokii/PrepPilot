from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
import logging

logger = logging.getLogger(__name__)

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
    pattern_source: Optional[str] = None
    pattern_company: Optional[str] = None

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

        # --- Grounded OA Pattern Extraction ---
        extracted_company = None
        extracted_role = None
        extracted_level = None
        
        # Run a fast extraction on the chat history
        if len(req.messages) > 1:
            extraction_prompt = "Extract the target company, role, and seniority level (if any) that the user is preparing for based on this conversation. Return ONLY a JSON object: {\"company\": \"...\", \"role\": \"...\", \"level\": \"...\"}. If not mentioned, use null."
            extractor_model = genai.GenerativeModel(
                model_name="gemini-flash-lite-latest",
                system_instruction=extraction_prompt
            )
            chat_text = "\\n".join([f"{m.role}: {m.content}" for m in req.messages])
            try:
                ext_res = await extractor_model.generate_content_async(chat_text)
                ext_text = ext_res.text.strip()
                if ext_text.startswith("```"):
                    ext_text = ext_text.split("```")[1]
                    if ext_text.startswith("json"):
                        ext_text = ext_text[4:]
                    ext_text = ext_text.strip()
                ext_data = json.loads(ext_text)
                extracted_company = ext_data.get("company")
                extracted_role = ext_data.get("role")
                extracted_level = ext_data.get("level")
            except Exception as e:
                logger.warning(f"Failed to extract company from chat: {e}")
        
        pattern = None
        pattern_source = "generic"
        if extracted_company:
            from app.services.oa_patterns import resolve_oa_pattern
            pattern = await resolve_oa_pattern(extracted_company, extracted_role, extracted_level, db)
            
        if pattern:
            pattern_source = "verified"
            # Build string for exact constraints
            constraints_str = f"This test MUST have exactly {pattern.mcq_count} MCQs and {pattern.coding_count} coding problems, total duration {pattern.duration_minutes} minutes"
            if pattern.topic_distribution:
                constraints_str += f", topic distribution approximately {json.dumps(pattern.topic_distribution)}"
            if pattern.difficulty_mix:
                constraints_str += f", difficulty mix {json.dumps(pattern.difficulty_mix)}"
            constraints_str += "."
            
            grounding_instruction = f"""
GROUNDED OA PATTERN (VERIFIED):
You MUST build the test blueprint using these EXACT constraints based on a verified OA pattern for {pattern.company}:
{constraints_str}
Do not hallucinate or guess different test sizes. Stick to these constraints.
"""
        else:
            grounding_instruction = """
GROUNDED OA PATTERN (GENERIC):
I don't have a verified pattern for this specific company/role yet. Use a generic template based on seniority:
- Entry level / Generic: 3 MCQs, 2 coding problems, 60-90 minutes.
- Senior / Architecture: 0 MCQs, 2-3 hard coding problems or system design, 90-120 minutes.

IMPORTANT: If the user EXPLICITLY requests a custom test size (e.g., "give me 40 mcqs and 2 coding"), you MUST ignore the generic template bounds and follow their exact requested counts for the blueprint.
"""

        system_instruction = f"""You are an expert technical interview coordinator for PrepPilot.
Your goal is to understand the user's interview situation (Target Company, Role, Seniority, Weak Topics) through a concise conversation.
Ask 1 or 2 targeted questions at a time to gather this info.
Once you have enough information, decide the EXACT blueprint of the test based on what that company typically asks.

{grounding_instruction}

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
    {{"type": "mcq", "topic": "Networking", "difficulty": "medium", "count": 10}},
    {{"type": "coding", "topic": "Graphs", "difficulty": "hard", "count": 2}}
  ]
}}

CRITICAL RULES FOR THE BLUEPRINT:
- If the user asks for N questions (e.g., 40 MCQs), you MUST set the "count" fields so they sum to exactly N!
- Use ONLY broad categorical names for topics. Allowed values: DSA, Arrays, Strings, Trees, Graphs, DP, Linked Lists, Sorting, Networking, CN, OS, DBMS, OOPs, System Design, Frontend, React, SQL, etc.
- Do NOT describe the actual question scenario or give hints about the specific problem.
- For example, use "Graphs" NOT "Find shortest path in a weighted directed graph".
"""

        text = ""
        groq_failed = False
        
        if settings.GROQ_API_KEY:
            try:
                from groq import AsyncGroq
                client = AsyncGroq(api_key=settings.GROQ_API_KEY)
                
                groq_messages = [{"role": "system", "content": system_instruction}]
                for m in req.messages:
                    groq_messages.append({
                        "role": "user" if m.role == "user" else "assistant",
                        "content": m.content
                    })
                    
                response = await client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=groq_messages,
                    temperature=0.7
                )
                text = response.choices[0].message.content.strip()
            except Exception as e:
                import logging
                logging.warning(f"Groq Chat API failed: {e}. Falling back to Gemini...")
                groq_failed = True

        if not settings.GROQ_API_KEY or groq_failed:
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

        # Robust JSON extraction
        import re
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
        conversational_part = ""
        if json_match:
            potential_json = json_match.group(1)
            conversational_part = text[:json_match.start()].strip()
        else:
            # Fallback to finding the first { and last }
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and start < end:
                potential_json = text[start:end+1]
                conversational_part = text[:start].strip()
                # Clean up conversational part if it ends with "```json" or similar
                if conversational_part.endswith("```json"):
                    conversational_part = conversational_part[:-7].strip()
                elif conversational_part.endswith("```"):
                    conversational_part = conversational_part[:-3].strip()
            else:
                potential_json = text

        try:
            data = json.loads(potential_json)
            if data.get("ready"):
                # Expand the blueprint items based on count
                original_bp = data.get("blueprint", [])
                expanded_bp = []
                for item in original_bp:
                    count = item.get("count", 1)
                    # ensure count is an int and reasonable
                    if not isinstance(count, int) or count < 1:
                        count = 1
                    if count > 50:
                        count = 50
                    # add `count` number of items
                    for _ in range(count):
                        expanded_bp.append({
                            "type": item.get("type", "mcq"),
                            "topic": item.get("topic", "General"),
                            "difficulty": item.get("difficulty", "medium")
                        })
                
                # Replace the compact blueprint with the expanded one
                data["blueprint"] = expanded_bp

                # Build a human-readable summary for the reply (using original_bp for summary)
                lines = []
                for i, item in enumerate(original_bp):
                    q_type = "MCQ" if item.get("type", "").lower() == "mcq" else "Coding"
                    count = item.get("count", 1)
                    lines.append(f"  {i+1}. {count}x {q_type} · {item.get('topic', 'General')} · {item.get('difficulty', 'medium').capitalize()}")
                summary = "\n".join(lines)
                
                reply_prefix = f"{conversational_part}\n\n" if conversational_part else ""
                
                if pattern_source == "verified" and pattern:
                    reply = f"{reply_prefix}Based on a verified {pattern.company} OA pattern, here's the test blueprint I've designed for you:\n\n{summary}\n\nDoes this look good? You can ask me to make changes, or confirm to start."
                else:
                    reply = f"{reply_prefix}I don't have a verified pattern for this specific request yet — using a general format instead:\n\n{summary}\n\nDoes this look good? You can ask me to make changes, or confirm to start."
                
                # Also include pattern_source inside the test_blueprint dictionary so frontend can access it
                data["pattern_source"] = pattern_source
                if pattern:
                    data["pattern_company"] = pattern.company
                    
                return ChatResponse(
                    is_ready=True,
                    reply=reply.strip(),
                    test_blueprint=data,
                    pattern_source=pattern_source,
                    pattern_company=pattern.company if pattern else None
                )
        except json.JSONDecodeError:
            pass
        
        # If not JSON, it's just a conversational reply
        return ChatResponse(
            is_ready=False,
            reply=text,
            test_blueprint=None
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"LLM Error: {str(e)}")
