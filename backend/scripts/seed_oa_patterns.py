import os
import sys
import json
import asyncio
from collections import defaultdict
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

# Add the backend directory to sys.path so we can import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.models import OAPattern
from app.core.config import settings
from app.core.database import Base

async def main():
    json_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../frontend/src/lib/questions.json'))
    
    if not os.path.exists(json_path):
        print(f"Error: Could not find {json_path}")
        return

    with open(json_path, 'r') as f:
        questions = json.load(f)

    # Aggregate data per company
    company_data = defaultdict(lambda: {
        'topics': defaultdict(int),
        'difficulties': defaultdict(int),
        'total': 0
    })

    for q in questions:
        company = q.get('company')
        topic = q.get('topic')
        difficulty = q.get('difficulty', '').lower()

        if not company or not topic:
            continue

        company_data[company]['topics'][topic] += 1
        company_data[company]['difficulties'][difficulty] += 1
        company_data[company]['total'] += 1

    engine = create_async_engine(settings.DATABASE_URL)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as db:
        for company, data in company_data.items():
            total = data['total']
            if total < 5:  # Skip companies with very little data
                continue

            # Calculate distributions
            topic_dist = {k: round(v / total, 2) for k, v in data['topics'].items()}
            
            # Sort topics by frequency and take top 5 to keep it clean
            top_topics = dict(sorted(topic_dist.items(), key=lambda item: item[1], reverse=True)[:5])
            
            diff_dist = {k: round(v / total, 2) for k, v in data['difficulties'].items()}

            # Check if pattern already exists
            query = select(OAPattern).where(OAPattern.company == company)
            res = await db.execute(query)
            existing = res.scalars().first()

            if existing:
                # Update existing
                existing.topic_distribution = top_topics
                existing.difficulty_mix = diff_dist
                existing.coding_count = 2  # default guess
                existing.duration_minutes = 90
            else:
                # Insert new
                pattern = OAPattern(
                    company=company,
                    mcq_count=0, # No MCQ info in LeetCode
                    coding_count=2,
                    duration_minutes=90,
                    topic_distribution=top_topics,
                    difficulty_mix=diff_dist,
                    confidence="low",
                    reviewed=False
                )
                db.add(pattern)

        await db.commit()
    print("Seed complete!")

if __name__ == "__main__":
    asyncio.run(main())
