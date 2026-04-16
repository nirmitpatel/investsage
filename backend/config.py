from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    ANTHROPIC_API_KEY: str
    FMP_API_KEY: str = ""           # Financial Modeling Prep — fundamentals (free 250 req/day)
    FINNHUB_API_KEY: str = ""       # Finnhub — analyst ratings + price targets (free 60 req/min)
    ALPHA_VANTAGE_API_KEY: str = "" # Alpha Vantage — news sentiment (free 25 req/day)
    ALLOWED_ORIGINS_STR: str = "http://localhost:3000"

    @property
    def ALLOWED_ORIGINS(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS_STR.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
