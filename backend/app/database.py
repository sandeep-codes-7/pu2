from sqlalchemy import text
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
        # 1. Create all missing tables
        await conn.run_sync(Base.metadata.create_all)

        # 2. Add any missing columns to existing tables (SQLite and generic)
        def migrate_schema(sync_conn):
            dialect_name = sync_conn.dialect.name
            if dialect_name == "sqlite":
                # --- ROOMS TABLE ---
                rows = sync_conn.execute(text("PRAGMA table_info(rooms)")).fetchall()
                cols = {r[1] for r in rows}
                if cols:
                    if "description" not in cols:
                        sync_conn.execute(text("ALTER TABLE rooms ADD COLUMN description TEXT"))
                        if "topic" in cols:
                            try:
                                sync_conn.execute(text("UPDATE rooms SET description = topic WHERE description IS NULL"))
                            except Exception:
                                pass
                    if "picture" not in cols:
                        sync_conn.execute(text("ALTER TABLE rooms ADD COLUMN picture VARCHAR(500)"))
                    if "creator_id" not in cols:
                        sync_conn.execute(text("ALTER TABLE rooms ADD COLUMN creator_id VARCHAR(36)"))
                    if "is_private" not in cols:
                        sync_conn.execute(text("ALTER TABLE rooms ADD COLUMN is_private BOOLEAN DEFAULT 0"))
                    if "invite_code" not in cols:
                        sync_conn.execute(text("ALTER TABLE rooms ADD COLUMN invite_code VARCHAR(50)"))

                # --- USERS TABLE ---
                u_rows = sync_conn.execute(text("PRAGMA table_info(users)")).fetchall()
                u_cols = {r[1] for r in u_rows}
                if u_cols:
                    if "gender" not in u_cols:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN gender VARCHAR(20) DEFAULT 'Prefer not to say'"))
                    if "bio" not in u_cols:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN bio VARCHAR(500) DEFAULT 'Hey there! I am pairing up on PairUP.'"))
                    if "interests" not in u_cols:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN interests VARCHAR(300) DEFAULT 'Coding, Gaming, Tech'"))
                    if "provider" not in u_cols:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN provider VARCHAR(50) DEFAULT 'google'"))

                # --- ROOM MODERATORS TABLE ---
                m_rows = sync_conn.execute(text("PRAGMA table_info(room_moderators)")).fetchall()
                m_cols = {r[1] for r in m_rows}
                if m_cols and "is_prime" not in m_cols:
                    sync_conn.execute(text("ALTER TABLE room_moderators ADD COLUMN is_prime BOOLEAN DEFAULT 0"))

                # --- ROOM ADMISSIONS TABLE ---
                try:
                    adm_rows = sync_conn.execute(text("PRAGMA table_info(room_admissions)")).fetchall()
                    adm_cols = {r[1] for r in adm_rows}
                    if adm_cols and "status" not in adm_cols:
                        sync_conn.execute(text("ALTER TABLE room_admissions ADD COLUMN status VARCHAR(20) DEFAULT 'pending'"))
                except Exception:
                    pass
            else:
                for col_name, col_def in [
                    ("description", "TEXT"),
                    ("picture", "VARCHAR(500)"),
                    ("creator_id", "VARCHAR(36)"),
                    ("is_private", "BOOLEAN DEFAULT FALSE"),
                    ("invite_code", "VARCHAR(50)")
                ]:
                    try:
                        sync_conn.execute(text(f"ALTER TABLE rooms ADD COLUMN IF NOT EXISTS {col_name} {col_def}"))
                    except Exception:
                        pass

        await conn.run_sync(migrate_schema)
