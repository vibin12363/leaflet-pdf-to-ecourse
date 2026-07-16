"""Course listing, detail (with per-user progress) and lazy lesson generation."""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from ..auth import get_current_user
from ..db import courses, documents, lessons, progress
from ..services import course_gen

router = APIRouter(prefix="/api/courses", tags=["courses"])


def _lesson_ids(course: dict) -> list[str]:
    return [ls["id"] for ch in course.get("chapters", [])
            for tp in ch.get("topics", []) for ls in tp.get("lessons", [])]


async def _get_owned(course_id: str, uid: str) -> dict:
    course = await courses.find_one({"_id": course_id, "uid": uid})
    if not course:
        raise HTTPException(404, "Course not found")
    return course


@router.get("")
async def list_courses(user: dict = Depends(get_current_user)):
    out = []
    async for c in courses.find({"uid": user["uid"]}).sort("created_at", -1):
        ids = _lesson_ids(c)
        prog = await progress.find_one({"uid": user["uid"], "course_id": c["_id"]}) or {}
        done = len(prog.get("completed", []))
        out.append({
            "id": c["_id"], "title": c.get("title"), "status": c.get("status"),
            "error": c.get("error"),
            "filename": c.get("filename"), "difficulty": c.get("difficulty"),
            "created_at": c.get("created_at"),
            "estimated_minutes": c.get("estimated_minutes"),
            "total_lessons": len(ids), "completed_lessons": done,
            "completion": round(done / len(ids) * 100) if ids else 0,
            "last_accessed": prog.get("updated_at"),
            "time_spent_seconds": prog.get("time_spent_seconds", 0),
        })
    return out


@router.get("/{course_id}")
async def get_course(course_id: str, user: dict = Depends(get_current_user)):
    course = await _get_owned(course_id, user["uid"])
    prog = await progress.find_one({"uid": user["uid"], "course_id": course_id}) or {}
    course["id"] = course.pop("_id")
    course.pop("digest", None)
    course["completed_lessons"] = prog.get("completed", [])
    course["last_lesson_id"] = prog.get("last_lesson_id")
    ids = _lesson_ids(course)
    course["completion"] = round(len(course["completed_lessons"]) / len(ids) * 100) if ids else 0
    return course


@router.get("/{course_id}/lessons/{lesson_id}")
async def get_lesson(course_id: str, lesson_id: str, user: dict = Depends(get_current_user)):
    course = await _get_owned(course_id, user["uid"])
    if course.get("status") != "ready":
        raise HTTPException(409, "Course is still being generated")

    cached = await lessons.find_one({"course_id": course_id, "lesson_id": lesson_id})
    if cached:
        cached.pop("_id", None)
        return cached

    # locate lesson in outline
    found = None
    for ci, ch in enumerate(course.get("chapters", [])):
        for tp in ch.get("topics", []):
            for ls in tp.get("lessons", []):
                if ls["id"] == lesson_id:
                    found = (ci, ch, tp, ls)
    if not found:
        raise HTTPException(404, "Lesson not found")
    ci, ch, tp, ls = found

    doc = await documents.find_one({"_id": course["document_id"]})
    chunks = doc.get("chunks", []) if doc else []
    start, end = course_gen.chapter_chunk_range(course, ci, len(chunks))
    source = "\n\n".join(c["text"] for c in chunks[start:end])

    import asyncio
    content = await asyncio.to_thread(
        course_gen.generate_lesson, course["title"], ch["title"], tp["title"], ls, source)
    record = {
        "course_id": course_id, "lesson_id": lesson_id, "uid": user["uid"],
        "title": ls["title"], "chapter": ch["title"], "topic": tp["title"],
        **content, "generated_at": datetime.now(timezone.utc),
    }
    await lessons.insert_one(dict(record))
    record.pop("_id", None)
    return record


@router.delete("/{course_id}")
async def delete_course(course_id: str, user: dict = Depends(get_current_user)):
    """Delete a course and everything attached to it."""
    course = await _get_owned(course_id, user["uid"])
    from ..db import documents as docs_col, chats, quizzes, quiz_attempts
    await courses.delete_one({"_id": course_id})
    await docs_col.delete_one({"_id": course.get("document_id")})
    await lessons.delete_many({"course_id": course_id})
    await progress.delete_many({"course_id": course_id})
    await chats.delete_many({"course_id": course_id})
    await quizzes.delete_many({"course_id": course_id})
    await quiz_attempts.delete_many({"course_id": course_id})
    return {"ok": True}


@router.post("/{course_id}/retry")
async def retry_course(course_id: str, background: BackgroundTasks,
                       user: dict = Depends(get_current_user)):
    """Re-run generation for a failed course using the already-stored chunks."""
    course = await _get_owned(course_id, user["uid"])
    if course.get("status") == "processing":
        raise HTTPException(409, "Course is already being generated")
    doc = await documents.find_one({"_id": course.get("document_id")})
    if not doc:
        raise HTTPException(404, "Original document no longer exists — upload the PDF again")
    await courses.update_one(
        {"_id": course_id},
        {"$set": {"status": "processing"}, "$unset": {"error": ""}},
    )
    from .documents import _generate
    background.add_task(_generate, course_id, doc["_id"], doc["filename"],
                        doc["chunks"], user["uid"])
    return {"ok": True, "status": "processing"}