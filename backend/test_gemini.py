import asyncio
from app.services.llm import generate_full_test_with_gemini

async def main():
    blueprint = [{"type": "coding", "topic": "Arrays", "difficulty": "easy"}]
    try:
        res = await generate_full_test_with_gemini(blueprint, style="standard")
        print("Success:", res)
    except Exception as e:
        print("Failed:", e)

if __name__ == "__main__":
    asyncio.run(main())
