"""Persistent learning progress + dashboard summary (streak, time, scores)."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Body
from ..auth import get_current_user
from ..db import progress, courses, quiz_attempts

router = APIRouter(prefix="/api", tags=["progress"])


@router.post("/courses/{course_id}/lessons/{lesson_id}/complete")
async def complete_lesson(course_id: str, lesson_id: str,
                          payload: dict = Body(default={}),
                          user: dict = Depends(get_current_user)):
    seconds = min(int(payload.get("seconds_spent", 0)), 3600)
    now = datetime.now(timezone.utc)
    await progress.update_one(
        {"uid": user["uid"], "course_id": course_id},
        {"$addToSet": {"completed": lesson_id},
         "$inc": {"time_spent_seconds": seconds},
         "$set": {"last_lesson_id": lesson_id, "updated_at": now},
         "$push": {"activity": {"lesson_id": lesson_id, "at": now}}},
        upsert=True,
    )
    return {"ok": True}


@router.post("/courses/{course_id}/resume")
async def set_resume_point(course_id: str, payload: dict = Body(...),
                           user: dict = Depends(get_current_user)):
    await progress.update_one(
        {"uid": user["uid"], "course_id": course_id},
        {"$set": {"last_lesson_id": payload.get("lesson_id"),
                  "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"ok": True}


@router.get("/progress/summary")
async def summary(user: dict = Depends(get_current_user)):
    total_time, active_days = 0, set()
    async for p in progress.find({"uid": user["uid"]}):
        total_time += p.get("time_spent_seconds", 0)
        for a in p.get("activity", []):
            active_days.add(a["at"].date().isoformat())

    # learning streak: consecutive days ending today/yesterday
    streak, day = 0, datetime.now(timezone.utc).date()
    if day.isoformat() not in active_days:
        day -= timedelta(days=1)
    while day.isoformat() in active_days:
        streak += 1
        day -= timedelta(days=1)

    scores = []
    async for a in quiz_attempts.find({"uid": user["uid"]}).sort("at", -1).limit(10):
        scores.append({"quiz_id": a["quiz_id"], "score": a["score"],
                       "total": a["total"], "at": a["at"]})

    total_courses = await courses.count_documents({"uid": user["uid"]})
    return {"total_courses": total_courses,
            "time_spent_seconds": total_time,
            "streak_days": streak,
            "recent_quiz_scores": scores}
