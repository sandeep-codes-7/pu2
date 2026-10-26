"""
Standalone database migration script for PairUP production environment.
Can be executed directly on the host or inside Docker:
    python migrate_db.py
    docker exec pairup-backend python migrate_db.py
"""
import sys
import os
import asyncio
from pathlib import Path

# Ensure app can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import text
from app.database import engine, Base
import app.models.entities  # Ensure models are loaded

async def run_migrations():
    print("[MIGRATE] Connecting to database...")
    async with engine.begin() as conn:
        print("[MIGRATE] Creating any missing tables...")
        await conn.run_sync(Base.metadata.create_all)

        def sync_migrations(sync_conn):
            dialect_name = sync_conn.dialect.name
            print(f"[MIGRATE] Engine dialect: {dialect_name}")

            if dialect_name == "sqlite":
                # --- ROOMS TABLE ---
                rows = sync_conn.execute(text("PRAGMA table_info(rooms)")).fetchall()
                cols = {r[1] for r in rows}
                print(f"[MIGRATE] Existing 'rooms' columns: {sorted(list(cols))}")

                if cols:
                    if "description" not in cols:
                        print("[MIGRATE] Adding 'description' column to rooms...")
                        sync_conn.execute(text("ALTER TABLE rooms ADD COLUMN description TEXT"))
                        if "topic" in cols:
                            sync_conn.execute(text("UPDATE rooms SET description = topic WHERE description IS NULL"))
                    if "picture" not in cols:
                        print("[MIGRATE] Adding 'picture' column to rooms...")
                        sync_conn.execute(text("ALTER TABLE rooms ADD COLUMN picture VARCHAR(500)"))
                    if "creator_id" not in cols:
                        print("[MIGRATE] Adding 'creator_id' column to rooms...")
                        sync_conn.execute(text("ALTER TABLE rooms ADD COLUMN creator_id VARCHAR(36)"))
                    if "is_private" not in cols:
                        print("[MIGRATE] Adding 'is_private' column to rooms...")
                        sync_conn.execute(text("ALTER TABLE rooms ADD COLUMN is_private BOOLEAN DEFAULT 0"))
                    if "invite_code" not in cols:
                        print("[MIGRATE] Adding 'invite_code' column to rooms...")
                        sync_conn.execute(text("ALTER TABLE rooms ADD COLUMN invite_code VARCHAR(50)"))

                # --- USERS TABLE ---
                u_rows = sync_conn.execute(text("PRAGMA table_info(users)")).fetchall()
                u_cols = {r[1] for r in u_rows}
                print(f"[MIGRATE] Existing 'users' columns: {sorted(list(u_cols))}")
                if u_cols:
                    if "gender" not in u_cols:
                        print("[MIGRATE] Adding 'gender' column to users...")
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN gender VARCHAR(20) DEFAULT 'Prefer not to say'"))
                    if "bio" not in u_cols:
                        print("[MIGRATE] Adding 'bio' column to users...")
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN bio VARCHAR(500) DEFAULT 'Hey there! I am pairing up on PairUP.'"))
                    if "interests" not in u_cols:
                        print("[MIGRATE] Adding 'interests' column to users...")
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN interests VARCHAR(300) DEFAULT 'Coding, Gaming, Tech'"))
                    if "provider" not in u_cols:
                        print("[MIGRATE] Adding 'provider' column to users...")
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN provider VARCHAR(50) DEFAULT 'google'"))

                # --- ROOM MODERATORS TABLE ---
                m_rows = sync_conn.execute(text("PRAGMA table_info(room_moderators)")).fetchall()
                m_cols = {r[1] for r in m_rows}
                if m_cols and "is_prime" not in m_cols:
                    print("[MIGRATE] Adding 'is_prime' column to room_moderators...")
                    sync_conn.execute(text("ALTER TABLE room_moderators ADD COLUMN is_prime BOOLEAN DEFAULT 0"))

                # --- ROOM ADMISSIONS TABLE ---
                try:
                    adm_rows = sync_conn.execute(text("PRAGMA table_info(room_admissions)")).fetchall()
                    adm_cols = {r[1] for r in adm_rows}
                    if adm_cols and "status" not in adm_cols:
                        print("[MIGRATE] Adding 'status' column to room_admissions...")
                        sync_conn.execute(text("ALTER TABLE room_admissions ADD COLUMN status VARCHAR(20) DEFAULT 'pending'"))
                except Exception as e:
                    print(f"[MIGRATE] Admissions check note: {e}")

                # Verify updated rooms columns
                updated_rows = sync_conn.execute(text("PRAGMA table_info(rooms)")).fetchall()
                updated_cols = {r[1] for r in updated_rows}
                print(f"[MIGRATE] Final 'rooms' columns: {sorted(list(updated_cols))}")

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
                    except Exception as e:
                        print(f"[MIGRATE] Column notice: {e}")

        await conn.run_sync(sync_migrations)
    print("[MIGRATE] Database migration successfully completed!")

if __name__ == "__main__":
    asyncio.run(run_migrations())
