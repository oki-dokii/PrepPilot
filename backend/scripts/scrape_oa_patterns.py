import os
import sys
import json
import asyncio
from duckduckgo_search import DDGS
import google.generativeai as genai
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.models import OAPattern
from app.core.config import settings

TARGET_COMPANIES = [
    "Google", "Amazon", "Microsoft", "Meta", "Apple", "Netflix", 
    "Uber", "Stripe", "Airbnb", "Databricks", "Snowflake", "Palantir",
    "Atlassian", "LinkedIn", "ByteDance", "Oracle", "Salesforce"
]

async def scrape_for_company(company, db):
    print(f"Researching OA patterns for {company}...")
    
    # Run a web search
    results = DDGS().text(f"{company} online assessment format hackerrank codesignal leetcode discuss", max_results=5)
    
    context = ""
    source_urls = []
    for r in results:
        context += f"Source: {r['href']}\\nTitle: {r['title']}\\nBody: {r['body']}\\n\\n"
        source_urls.append(r['href'])
        
    if not context:
        print(f"No search results found for {company}")
        return
        
    prompt = f"""
Based on the following search results about {company}'s Online Assessment (OA) format, extract the standard structure.
If you can't find solid evidence, use your general knowledge of this company's typical OA.
Return a JSON object strictly matching this format:
{{
  "company": "{company}",
  "role": null,
  "level": null,
  "mcq_count": 0,
  "coding_count": 2,
  "duration_minutes": 90,
  "topic_distribution": {{"Graphs": 0.5, "DP": 0.5}},
  "difficulty_mix": {{"medium": 1, "hard": 1}},
  "is_sectioned": false
}}

Search Results:
{context}
"""

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(model_name="gemini-flash-lite-latest")
    
    try:
        response = await model.generate_content_async(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
            
        data = json.loads(text)
        
        # Upsert into DB
        query = select(OAPattern).where(OAPattern.company == company)
        res = await db.execute(query)
        existing = res.scalars().first()
        
        if existing:
            existing.mcq_count = data.get("mcq_count", 0)
            existing.coding_count = data.get("coding_count", 2)
            existing.duration_minutes = data.get("duration_minutes", 90)
            existing.topic_distribution = data.get("topic_distribution", {})
            existing.difficulty_mix = data.get("difficulty_mix", {})
            existing.is_sectioned = data.get("is_sectioned", False)
            existing.source_urls = source_urls
            existing.confidence = "medium"
        else:
            pattern = OAPattern(
                company=company,
                role=data.get("role"),
                level=data.get("level"),
                mcq_count=data.get("mcq_count", 0),
                coding_count=data.get("coding_count", 2),
                duration_minutes=data.get("duration_minutes", 90),
                topic_distribution=data.get("topic_distribution", {}),
                difficulty_mix=data.get("difficulty_mix", {}),
                is_sectioned=data.get("is_sectioned", False),
                source_urls=source_urls,
                confidence="medium",
                reviewed=False
            )
            db.add(pattern)
            
        await db.commit()
        print(f"Saved extracted pattern for {company}")
        
    except Exception as e:
        print(f"Failed to extract/save pattern for {company}: {e}")

async def main():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session() as db:
        for company in TARGET_COMPANIES:
            await scrape_for_company(company, db)
            await asyncio.sleep(2) # rate limit prevention

if __name__ == "__main__":
    asyncio.run(main())
