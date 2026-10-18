import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.future import select
from sqlalchemy import or_

from app.server import app
from app.database import AsyncSessionLocal, init_db
from app.models.entities import User, Friendship, MateQueue, MateConversation, MateParticipant, MateMessage
from app.services.matchmaking import normalize_interests, calculate_jaccard_similarity
from app.services.auth_service import create_access_token

client = TestClient(app)

def test_normalize_interests():
    raw = "  Coding, MUSIC, gaming, coding,   Music  , , Movies "
    normalized = normalize_interests(raw)
    assert normalized == ["coding", "music", "gaming", "movies"]

def test_calculate_jaccard_similarity():
    list1 = ["coding", "music", "gaming"]
    list2 = ["coding", "music", "movies"]
    sim = calculate_jaccard_similarity(list1, list2)
    assert sim == 0.5
    assert calculate_jaccard_similarity(["a"], ["b"]) == 0.0
    assert calculate_jaccard_similarity(["a", "b"], ["b", "a"]) == 1.0
    assert calculate_jaccard_similarity([], []) == 0.0

async def _test_instant_pass_restrictions_async():
    await init_db()
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.username == "demo_tester_mate"))
        demo_user = result.scalars().first()
        if not demo_user:
            demo_user = User(
                username="demo_tester_mate",
                name="Demo Tester",
                email="demo_tester_mate@instantpass.local",
                provider="demo"
            )
            session.add(demo_user)
            await session.commit()
            await session.refresh(demo_user)
        demo_token = create_access_token(data={"sub": demo_user.id})

    # 1. Instant pass user cannot join mate queue
    res = client.post(
        "/api/mate/queue/join",
        json={"interests": "coding, music"},
        headers={"Authorization": f"Bearer {demo_token}"}
    )
    assert res.status_code == 403
    assert "You should login to use these features." in res.json().get("detail", "")

    # 2. Instant pass user cannot send friend request
    res = client.post(
        "/api/friends/request",
        json={"addressee_id": "some_id"},
        headers={"Authorization": f"Bearer {demo_token}"}
    )
    assert res.status_code == 403
    assert "You should login to use these features." in res.json().get("detail", "")

def test_instant_pass_restrictions():
    asyncio.run(_test_instant_pass_restrictions_async())

async def _test_mate_matchmaking_flow_async():
    await init_db()
    async with AsyncSessionLocal() as session:
        # Create 2 authenticated users
        r1 = await session.execute(select(User).where(User.username == "auth_mate_u1"))
        u1 = r1.scalars().first()
        if not u1:
            u1 = User(username="auth_mate_u1", name="Alice", email="alice@test.com", provider="google")
            session.add(u1)

        r2 = await session.execute(select(User).where(User.username == "auth_mate_u2"))
        u2 = r2.scalars().first()
        if not u2:
            u2 = User(username="auth_mate_u2", name="Bob", email="bob@test.com", provider="google")
            session.add(u2)

        await session.commit()
        await session.refresh(u1)
        await session.refresh(u2)

        # Cleanup existing queue, participants, conversations, and friendships
        p_res = await session.execute(select(MateParticipant).where(MateParticipant.user_id.in_([u1.id, u2.id])))
        parts = p_res.scalars().all()
        conv_ids = [p.conversation_id for p in parts]
        for p in parts:
            await session.delete(p)

        if conv_ids:
            c_res = await session.execute(select(MateConversation).where(MateConversation.id.in_(conv_ids)))
            for c in c_res.scalars().all():
                await session.delete(c)

        q_res = await session.execute(select(MateQueue).where(MateQueue.user_id.in_([u1.id, u2.id])))
        for q in q_res.scalars().all():
            await session.delete(q)

        f_res = await session.execute(select(Friendship).where(
            or_(
                (Friendship.requester_id == u1.id) & (Friendship.addressee_id == u2.id),
                (Friendship.requester_id == u2.id) & (Friendship.addressee_id == u1.id)
            )
        ))
        for f in f_res.scalars().all():
            await session.delete(f)

        await session.commit()

        t1 = create_access_token(data={"sub": u1.id})
        t2 = create_access_token(data={"sub": u2.id})
        u1_id = u1.id
        u2_id = u2.id

    # User 1 joins queue
    res1 = client.post(
        "/api/mate/queue/join",
        json={"interests": "coding, gaming, anime"},
        headers={"Authorization": f"Bearer {t1}"}
    )
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["status"] == "searching"
    assert data1["expires_at"] is not None

    # Check status endpoint for User 1
    res_status = client.get(
        "/api/mate/queue/status",
        headers={"Authorization": f"Bearer {t1}"}
    )
    assert res_status.status_code == 200
    assert res_status.json()["status"] == "searching"

    # User 2 joins queue with overlapping interests
    res2 = client.post(
        "/api/mate/queue/join",
        json={"interests": "coding, gaming, sci-fi"},
        headers={"Authorization": f"Bearer {t2}"}
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["status"] == "matched"
    assert "conversation_id" in data2
    conv_id = data2["conversation_id"]

    # Both users should have different animal nicknames in the conversation
    res_conv1 = client.get(
        f"/api/mate/conversations/{conv_id}",
        headers={"Authorization": f"Bearer {t1}"}
    )
    assert res_conv1.status_code == 200
    c1 = res_conv1.json()
    assert c1["my_nickname"] != c1["partner_nickname"]
    # Anonymity: before mutual interest, partner_user_id is None
    assert c1["partner_user_id"] is None
    assert c1["mutual_interest"] is False

    res_conv2 = client.get(
        f"/api/mate/conversations/{conv_id}",
        headers={"Authorization": f"Bearer {t2}"}
    )
    assert res_conv2.status_code == 200
    c2 = res_conv2.json()
    assert c2["my_nickname"] == c1["partner_nickname"]
    assert c2["partner_nickname"] == c1["my_nickname"]
    assert c2["partner_user_id"] is None

    # User 1 expresses interest
    int1 = client.post(
        f"/api/mate/conversations/{conv_id}/interested",
        headers={"Authorization": f"Bearer {t1}"}
    )
    assert int1.status_code == 200
    assert int1.json()["my_interest"] is True
    assert int1.json()["mutual_interest"] is False

    # User 2 expresses interest -> triggers mutual interest!
    int2 = client.post(
        f"/api/mate/conversations/{conv_id}/interested",
        headers={"Authorization": f"Bearer {t2}"}
    )
    assert int2.status_code == 200
    int2_data = int2.json()
    assert int2_data["mutual_interest"] is True
    assert int2_data["partner_user_id"] == u1_id

    # Verify reciprocal friendship exists in database with status accepted
    async with AsyncSessionLocal() as session:
        f_res = await session.execute(select(Friendship).where(
            or_(
                (Friendship.requester_id == u1_id) & (Friendship.addressee_id == u2_id),
                (Friendship.requester_id == u2_id) & (Friendship.addressee_id == u1_id)
            )
        ))
        friendship = f_res.scalars().first()
        assert friendship is not None
        assert friendship.status == "accepted"

    # User 1 exits conversation
    exit1 = client.post(
        f"/api/mate/conversations/{conv_id}/exit",
        headers={"Authorization": f"Bearer {t1}"}
    )
    assert exit1.status_code == 200

    # User 2 checks conversation -> has_left is True
    res_conv2_after = client.get(
        f"/api/mate/conversations/{conv_id}",
        headers={"Authorization": f"Bearer {t2}"}
    )
    assert res_conv2_after.json()["has_left"] is True

def test_mate_matchmaking_flow():
    asyncio.run(_test_mate_matchmaking_flow_async())

if __name__ == "__main__":
    print("Testing normalize_interests...")
    test_normalize_interests()
    print("Testing calculate_jaccard_similarity...")
    test_calculate_jaccard_similarity()
    print("Testing instant pass restrictions...")
    test_instant_pass_restrictions()
    print("Testing mate matchmaking and mutual interest flow...")
    test_mate_matchmaking_flow()
    print("ALL TESTS PASSED!")
