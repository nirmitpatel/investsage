from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from api import health, portfolio, tax, ai, analytics, share
from services.price_refresh import price_refresh_loop
import asyncio


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(price_refresh_loop())
    yield
    task.cancel()


app = FastAPI(title="InvestSage API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(portfolio.router, prefix="/api/v1/portfolio", tags=["portfolio"])
app.include_router(tax.router, prefix="/api/v1/tax", tags=["tax"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
app.include_router(share.router, prefix="/api/v1/share", tags=["share"])
