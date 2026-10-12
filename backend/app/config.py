import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Robustly find .env from current directory or parent directory
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)
else:
    load_dotenv(override=True)

class Settings(BaseSettings):
    APP_NAME: str = "PairUP"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "pairup-super-secret-jwt-key-2026-production-grade")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Google OAuth2 Settings (strips any surrounding quotes)
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "").strip('"\'')
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "").strip('"\'')
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5173/auth/callback").strip('"\'')

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./pairup.db")

    # Frontend URL for CORS
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    class Config:
        extra = "ignore"

settings = Settings()
