"""
Value Dashboard endpoint — shows the ROI of following Sage recommendations.
"""

import asyncio
from fastapi import APIRouter, Depends

from services.db.supabase_client import (
    get_or_create_portfolio, get_positions,
    track_recommendation_outcomes, get_value_stats,
)
from dependencies import get_current_user

router = APIRouter()


@router.get("")
async def get_value_dashboard(user_id: str = Depends(get_current_user)):
    """Return value dashboard: recommendation history, outcomes, and aggregate stats."""
    portfolio = await asyncio.to_thread(get_or_create_portfolio, user_id)
    positions = await asyncio.to_thread(get_positions, portfolio["id"])
    # Update any due checkpoint outcomes in background before returning stats
    await asyncio.to_thread(track_recommendation_outcomes, user_id, positions)
    stats = await asyncio.to_thread(get_value_stats, user_id, positions)
    return stats
