from fastapi import APIRouter, HTTPException, Depends
import asyncio

from services.db.supabase_client import (
    get_supabase,
    get_or_create_portfolio,
    get_positions,
    create_share_token,
    get_share_token_row,
    delete_share_token,
    get_user_share_tokens,
)
from api.portfolio import _build_health
from dependencies import get_current_user

router = APIRouter()


@router.post("")
async def create_share(user_id: str = Depends(get_current_user)):
    portfolio = get_or_create_portfolio(user_id)
    positions = get_positions(portfolio["id"])
    if not positions:
        raise HTTPException(status_code=400, detail="Import positions before creating a share link")
    token = create_share_token(portfolio["id"], user_id)
    return {"token": token}


@router.get("/tokens")
async def list_shares(user_id: str = Depends(get_current_user)):
    portfolio = get_or_create_portfolio(user_id)
    tokens = get_user_share_tokens(portfolio["id"])
    return {"tokens": tokens}


@router.delete("/{token}")
async def revoke_share(token: str, user_id: str = Depends(get_current_user)):
    deleted = delete_share_token(token, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Share token not found")
    return {"deleted": True}


@router.get("/{token}")
async def get_shared_portfolio(token: str):
    row = get_share_token_row(token)
    if not row:
        raise HTTPException(status_code=404, detail="Share link not found or expired")

    portfolio_id = row["portfolio_id"]
    sb = get_supabase()
    portfolio_result = sb.table("portfolios").select("*").eq("id", portfolio_id).limit(1).execute()
    if not portfolio_result.data:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    portfolio = portfolio_result.data[0]
    positions = get_positions(portfolio_id)
    health = await asyncio.to_thread(_build_health, positions, portfolio)

    return {
        "portfolio": {
            "name": portfolio.get("name"),
            "brokerage": portfolio.get("brokerage"),
            "investment_style": portfolio.get("investment_style"),
        },
        "positions": positions,
        "health": health,
    }
