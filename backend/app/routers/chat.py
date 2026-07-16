"""AI learning companion: context-aware chat grounded in the uploaded PDF."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Body, HTTPException
from ..auth import get_current_user
from ..db import chats, courses, documents
from ..services import llm, pdf

router = APIRouter(prefix="/api/courses/{course_id}/chat", tags=["chat"])

COMPANION_SYSTEM = """You are the AI Learning Companion inside an e-course generated from a document the learner uploaded.
Your abilities: explain difficult concepts simply, summarize chapters, generate short quizzes on demand, suggest which lesson to study next, and ask one good follow-up question when it helps learning.
Rules:
- Ground answers in the COURSE CONTEXT and SOURCE EXCERPTS provided. If something isn't covered there, say so briefly, then help from general knowledge.
- Be concise and encouraging. Use markdown. Prefer short paragraphs and bullets.
- When asked for a quiz, produce 3-5 questions with answers hidden below a "Answers" heading."""


@router.get("")
async def history(course_id: str, user: dict = Depends(get_current_user)):
    out = []
    async for m in chats.find({"uid": user["uid"], "course_id": course_id}).sort("at", 1):
        out.append({"role": m["role"], "content": m["content"], "at": m["at"]})
    return out


@router.post("")
async def send(course_id: str, payload: dict = Body(...),
               user: dict = Depends(get_current_user)):
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(400, "Empty message")
    course = await courses.find_one({"_id": course_id, "uid": user["uid"]})
    if not course:
        raise HTTPException(404, "Course not found")

    # retrieval: keyword-scored chunks from the source document (lightweight RAG)
    doc = await documents.find_one({"_id": course["document_id"]})
    top = pdf.keyword_retrieve(doc.get("chunks", []), message, top_k=3) if doc else []
    excerpts = "\n\n---\n\n".join(
        f"(pages {c['pages'][0]}-{c['pages'][1]})\n{c['text'][:4000]}" for c in top)

    toc = "\n".join(
        f"- {ch['title']}: " + ", ".join(ls["title"] for tp in ch.get("topics", [])
                                         for ls in tp.get("lessons", []))
        for ch in course.get("chapters", []))
    context = (f"COURSE: {course.get('title')}\nDESCRIPTION: {course.get('description','')}\n"
               f"TABLE OF CONTENTS:\n{toc}\n\nSOURCE EXCERPTS:\n{excerpts}")

    recent = []
    async for m in chats.find({"uid": user["uid"], "course_id": course_id}).sort("at", -1).limit(8):
        recent.append({"role": m["role"], "content": m["content"]})
    recent.reverse()

    messages = ([{"role": "system", "content": COMPANION_SYSTEM},
                 {"role": "system", "content": context}]
                + recent + [{"role": "user", "content": message}])
    import asyncio
    answer = await asyncio.to_thread(llm.chat, messages, 0.5, 1500)

    now = datetime.now(timezone.utc)
    await chats.insert_many([
        {"uid": user["uid"], "course_id": course_id, "role": "user", "content": message, "at": now},
        {"uid": user["uid"], "course_id": course_id, "role": "assistant", "content": answer, "at": now},
    ])
    return {"reply": answer}