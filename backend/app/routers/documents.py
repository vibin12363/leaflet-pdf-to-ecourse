"""PDF upload -> background course generation with polled status."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from ..auth import get_current_user
from ..db import documents, courses
from ..services import pdf, course_gen

router = APIRouter(prefix="/api/documents", tags=["documents"])

MAX_SIZE = 25 * 1024 * 1024  # 25 MB


async def _generate(course_id: str, doc_id: str, filename: str,
                    chunks: list[dict], uid: str):
    try:
        # run blocking LLM work in threads so the event loop stays responsive
        import asyncio
        digest = await asyncio.to_thread(course_gen.digest_chunks, chunks)
        outline = await asyncio.to_thread(course_gen.generate_outline, digest, filename)
        await courses.update_one(
            {"_id": course_id},
            {"$set": {**outline, "status": "ready", "digest": digest,
                      "ready_at": datetime.now(timezone.utc)}},
        )
        # prefetch the first lesson so the learner's first click is instant
        try:
            ch = outline["chapters"][0]
            tp = ch["topics"][0]
            ls = tp["lessons"][0]
            start, end = course_gen.chapter_chunk_range(outline, 0, len(chunks))
            source = "\n\n".join(c["text"] for c in chunks[start:end])
            content = await asyncio.to_thread(
                course_gen.generate_lesson, outline["title"], ch["title"],
                tp["title"], ls, source)
            from ..db import lessons
            await lessons.insert_one({
                "course_id": course_id, "lesson_id": ls["id"], "uid": uid,
                "title": ls["title"], "chapter": ch["title"], "topic": tp["title"],
                **content, "generated_at": datetime.now(timezone.utc),
            })
        except Exception:
            pass  # prefetch is best-effort; lazy generation covers it
    except Exception as e:
        await courses.update_one(
            {"_id": course_id},
            {"$set": {"status": "failed", "error": str(e)[:500]}},
        )


@router.post("")
async def upload_pdf(background: BackgroundTasks,
                     file: UploadFile = File(...),
                     user: dict = Depends(get_current_user)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(413, "PDF larger than 25 MB")
    try:
        pages = pdf.extract_pages(data)
    except Exception:
        raise HTTPException(422, "Could not read this PDF. Is it a valid, non-encrypted file?")
    if sum(len(p) for p in pages) < 200:
        raise HTTPException(422, "This PDF has almost no extractable text (it may be scanned images)")

    chunks = pdf.build_chunks(pages)
    doc_id, course_id = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    await documents.insert_one({
        "_id": doc_id, "uid": user["uid"], "filename": file.filename,
        "num_pages": len(pages), "num_chunks": len(chunks),
        "chunks": chunks, "uploaded_at": now,
    })
    await courses.insert_one({
        "_id": course_id, "uid": user["uid"], "document_id": doc_id,
        "filename": file.filename, "status": "processing", "created_at": now,
        "title": file.filename.rsplit(".", 1)[0],
    })
    background.add_task(_generate, course_id, doc_id, file.filename, chunks, user["uid"])
    return {"course_id": course_id, "document_id": doc_id, "status": "processing",
            "num_pages": len(pages)}