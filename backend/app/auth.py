import json
import firebase_admin
from firebase_admin import credentials, auth as fb_auth
from fastapi import Header, HTTPException, Depends
from . import config
from .db import users
from datetime import datetime, timezone

if not firebase_admin._apps:
    if config.FIREBASE_SERVICE_ACCOUNT_JSON:
        cred = credentials.Certificate(json.loads(config.FIREBASE_SERVICE_ACCOUNT_JSON))
        firebase_admin.initialize_app(cred)
    else:
        firebase_admin.initialize_app()  # ADC fallback


async def get_current_user(authorization: str = Header(None)) -> dict:
    """Verify Firebase ID token from `Authorization: Bearer <token>` and upsert the user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        decoded = fb_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    user = {
        "uid": decoded["uid"],
        "email": decoded.get("email"),
        "name": decoded.get("name") or decoded.get("email", "Learner"),
        "photo": decoded.get("picture"),
    }
    await users.update_one(
        {"uid": user["uid"]},
        {"$set": {**user, "last_seen": datetime.now(timezone.utc)},
         "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return user
