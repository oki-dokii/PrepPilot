from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.models import User, OAPattern

router = APIRouter()

@router.patch("/oa-patterns/{pattern_id}/review")
async def review_oa_pattern(
    pattern_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # In a real app we'd verify current_user.is_admin, but we skip for this proof of concept.
    query = select(OAPattern).where(OAPattern.id == pattern_id)
    result = await db.execute(query)
    pattern = result.scalars().first()
    
    if not pattern:
        raise HTTPException(status_code=404, detail="OA pattern not found")
        
    pattern.reviewed = True
    await db.flush()
    
    return {"status": "success", "id": pattern.id, "reviewed": pattern.reviewed}
