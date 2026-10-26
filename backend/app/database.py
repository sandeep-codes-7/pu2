from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    import app.models.entities  # Ensures all models are registered on Base.metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        def add_missing_columns(connection):
            try:
                cursor = connection.cursor()
                cursor.execute("PRAGMA table_info(rooms)")
                cols = [col[1] for col in cursor.fetchall()]
                if cols and "invite_code" not in cols:
                    cursor.execute("ALTER TABLE rooms ADD COLUMN invite_code VARCHAR(50)")
            except Exception:
                pass
        await conn.run_sync(add_missing_columns)
