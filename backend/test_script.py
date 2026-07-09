import asyncio
import os
import sys

from app.core.database import async_session_maker
from app.services.test_gen import generate_test_sync
from app.models.models import Problem, TestCase, User
from sqlalchemy import select

async def main():
    async with async_session_maker() as db:
        result = await db.execute(select(User).limit(1))
        user = result.scalars().first()
        if not user:
            print("No users in db, creating one...")
            user = User(email="test@example.com", name="Test")
            db.add(user)
            await db.flush()

        print("Generating a new problem in STANDARD mode...")
        session_id = user.id
        spec = {
            "duration_minutes": 90,
            "blueprint": [
                {"type": "coding", "topic": "Arrays", "difficulty": "medium", "style": "standard"}
            ]
        }
        
        # Override the style in llm prompt temporarily for testing
        from app.services import llm
        original_call = llm._call_llm
        
        async def mock_call_llm(prompt, is_json=False):
            # Hack to force 'standard' style since our schema randomizes it
            modified_prompt = prompt.replace("leetcode|standard (randomly choose one)", "standard")
            return await original_call(modified_prompt, is_json)
            
        llm._call_llm = mock_call_llm
        
        await generate_test_sync(session_id, spec, db)
        print("Generation complete!")
        
        result = await db.execute(select(Problem).order_by(Problem.created_at.desc()).limit(1))
        problem = result.scalars().first()
        
        if not problem:
            print("Failed to generate problem.")
            return
            
        print(f"\nGenerated Problem: {problem.title}")
        print(f"Style: {problem.problem_style}")
        print(f"Input Schema: {problem.input_schema}")
        print(f"Output Type: {problem.output_type}")
        if problem.starter_code_dict:
            print("\nStarter Code (Python):")
            print(problem.starter_code_dict.get("python3", "Missing"))
            print("\nStarter Code (C++):")
            print(problem.starter_code_dict.get("cpp", "Missing"))
        else:
            print("\nStarter Code Dict is missing!")

if __name__ == "__main__":
    asyncio.run(main())
