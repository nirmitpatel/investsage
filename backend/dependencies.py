"""
Shared FastAPI dependencies.
"""

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from services.db.supabase_client import get_supabase

security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        sb = get_supabase()
        result = sb.auth.get_user(credentials.credentials)
        return result.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
