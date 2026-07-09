from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "PrepPilot"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://prepuser:preppass@db:5432/prepdb"
    DATABASE_SYNC_URL: str = "postgresql://prepuser:preppass@db:5432/prepdb"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # JWT
    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Gemini
    GEMINI_API_KEY: str = ""

    # Groq
    GROQ_API_KEY: str = ""

    # Judge0
    JUDGE0_URL: str = "https://judge0-ce.p.rapidapi.com"
    JUDGE0_API_KEY: str = ""
    JUDGE0_HOST: str = "judge0-ce.p.rapidapi.com"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
