import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.models import OAPattern

logger = logging.getLogger(__name__)

async def resolve_oa_pattern(company: str, role: Optional[str], level: Optional[str], db: AsyncSession) -> Optional[OAPattern]:
    """
    Fuzzy match against company first, then narrow by role/level if multiple rows match.
    Only return rows where reviewed = True.
    """
    if not company:
        return None

    # Find all reviewed patterns for this company (case-insensitive fuzzy match)
    query = select(OAPattern).where(
        and_(
            OAPattern.company.op("~*")(rf"\b{company}\b"),
            OAPattern.reviewed == True
        )
    )
    result = await db.execute(query)
    patterns = result.scalars().all()

    if not patterns:
        return None

    if len(patterns) == 1:
        return patterns[0]

    # Multiple matches found, try to narrow by role and level
    best_match = None
    best_score = -1

    for p in patterns:
        score = 0
        
        if role and p.role and role.lower() in p.role.lower():
            score += 2
        elif role and p.role and p.role.lower() in role.lower():
            score += 1
            
        if level and p.level and level.lower() in p.level.lower():
            score += 2
        elif level and p.level and p.level.lower() in level.lower():
            score += 1

        if score > best_score:
            best_score = score
            best_match = p

    # If scores are tied at 0 (no role/level match), just return the first one
    if best_match:
        return best_match
    
    return patterns[0]
