import asyncio
from app.routers.chat import ChatMessage, ChatRequest

messages = [
    ChatMessage(role="assistant", content="Hi! I'm your AI Prep Coordinator. What company and role are you interviewing for? (e.g. Google Backend L4, or entry-level Frontend)"),
    ChatMessage(role="user", content="I want to test Stripe backend"),
]

req = ChatRequest(messages=messages)

history = []
start_idx = 0
while start_idx < len(req.messages) - 1 and req.messages[start_idx].role != "user":
    start_idx += 1
    
for m in req.messages[start_idx:-1]:
    history.append({
        "role": "user" if m.role == "user" else "model",
        "parts": [m.content]
    })

print("History sent to Gemini:")
print(history)
print("Latest message to send:", req.messages[-1].content)

import google.generativeai as genai
from app.core.config import settings

genai.configure(api_key=settings.GEMINI_API_KEY)
model = genai.GenerativeModel(model_name="gemini-flash-lite-latest")
chat = model.start_chat(history=history)
try:
    response = chat.send_message(req.messages[-1].content)
    print("Response:", response.text)
except Exception as e:
    import traceback
    traceback.print_exc()

