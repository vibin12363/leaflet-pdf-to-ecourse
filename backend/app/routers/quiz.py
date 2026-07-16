"""Per-chapter quiz generation (cached), submission scoring, attempt history."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Body
from ..auth import get_current_user
from ..db import quizzes, quiz_attempts, courses, documents
from ..services import course_gen

router = APIRouter(prefix="/api", tags=["quiz"])


def _public(quiz: dict) -> dict:
    """Strip answers/explanations before sending questions to the client."""
    return {
        "quiz_id": quiz["_id"], "course_id": quiz["course_id"],
        "chapter_index": quiz["chapter_index"], "chapter_title": quiz["chapter_title"],
        "questions": [
            {"type": q["type"], "question": q["question"], "options": q.get("options")}
            for q in quiz["questions"]
        ],
    }


@router.post("/courses/{course_id}/chapters/{chapter_index}/quiz")
async def get_or_create_quiz(course_id: str, chapter_index: int,
                             user: dict = Depends(get_current_user)):
    course = await courses.find_one({"_id": course_id, "uid": user["uid"]})
    if not course or course.get("status") != "ready":
        raise HTTPException(404, "Course not ready")
    chapters = course.get("chapters", [])
    if chapter_index < 0 or chapter_index >= len(chapters):
        raise HTTPException(404, "Chapter not found")

    existing = await quizzes.find_one({"course_id": course_id, "chapter_index": chapter_index})
    if existing:
        return _public(existing)

    doc = await documents.find_one({"_id": course["document_id"]})
    chunks = doc.get("chunks", []) if doc else []
    start, end = course_gen.chapter_chunk_range(course, chapter_index, len(chunks))
    source = "\n\n".join(c["text"] for c in chunks[start:end])

    import asyncio
    generated = await asyncio.to_thread(
        course_gen.generate_quiz, course["title"], chapters[chapter_index], source)
    quiz = {
        "_id": str(uuid.uuid4()), "course_id": course_id, "uid": user["uid"],
        "chapter_index": chapter_index, "chapter_title": chapters[chapter_index]["title"],
        "questions": generated.get("questions", []),
        "created_at": datetime.now(timezone.utc),
    }
    await quizzes.insert_one(quiz)
    return _public(quiz)


@router.post("/quizzes/{quiz_id}/submit")
async def submit(quiz_id: str, payload: dict = Body(...),
                 user: dict = Depends(get_current_user)):
    quiz = await quizzes.find_one({"_id": quiz_id})
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    answers = payload.get("answers", [])  # list aligned with questions
    results, score = [], 0
    for i, q in enumerate(quiz["questions"]):
        given = (answers[i] if i < len(answers) else "") or ""
        if q["type"] == "short_answer":
            # lenient keyword match for short answers
            key_terms = [w for w in q["answer"].lower().split() if len(w) > 3]
            hits = sum(1 for w in key_terms if w in given.lower())
            correct = bool(key_terms) and hits >= max(1, len(key_terms) // 2)
        else:
            correct = given.strip().lower() == q["answer"].strip().lower()
        score += int(correct)
        results.append({"question": q["question"], "your_answer": given,
                        "correct_answer": q["answer"], "correct": correct,
                        "explanation": q.get("explanation", "")})
    attempt = {
        "_id": str(uuid.uuid4()), "uid": user["uid"], "quiz_id": quiz_id,
        "course_id": quiz["course_id"], "chapter_title": quiz["chapter_title"],
        "score": score, "total": len(quiz["questions"]),
        "results": results, "at": datetime.now(timezone.utc),
    }
    await quiz_attempts.insert_one(attempt)
    attempt.pop("_id")
    return attempt


@router.get("/quizzes/attempts")
async def attempts(user: dict = Depends(get_current_user)):
    out = []
    async for a in quiz_attempts.find({"uid": user["uid"]}).sort("at", -1).limit(50):
        a.pop("_id", None)
        out.append(a)
    return out