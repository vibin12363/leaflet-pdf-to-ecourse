"""Search across chapters, topics, lessons and generated content."""
import re
from fastapi import APIRouter, Depends, Query
from ..auth import get_current_user
from ..db import courses, lessons

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search(q: str = Query(..., min_length=2),
                 course_id: str | None = None,
                 user: dict = Depends(get_current_user)):
    rx = re.compile(re.escape(q), re.IGNORECASE)
    filt = {"uid": user["uid"], "status": "ready"}
    if course_id:
        filt["_id"] = course_id

    hits = []
    async for c in courses.find(filt):
        for ch in c.get("chapters", []):
            if rx.search(ch["title"]):
                hits.append({"kind": "chapter", "course_id": c["_id"],
                             "course_title": c["title"], "title": ch["title"]})
            for tp in ch.get("topics", []):
                if rx.search(tp["title"]):
                    hits.append({"kind": "topic", "course_id": c["_id"],
                                 "course_title": c["title"], "title": tp["title"],
                                 "chapter": ch["title"]})
                for ls in tp.get("lessons", []):
                    if rx.search(ls["title"]) or rx.search(ls.get("subtopic", "")):
                        hits.append({"kind": "lesson", "course_id": c["_id"],
                                     "course_title": c["title"], "title": ls["title"],
                                     "lesson_id": ls["id"], "chapter": ch["title"]})

    # keyword hits inside already-generated lesson content
    lfilt = {"uid": user["uid"], "explanation": rx}
    if course_id:
        lfilt["course_id"] = course_id
    async for l in lessons.find(lfilt).limit(20):
        snippet_m = rx.search(l["explanation"])
        start = max(0, snippet_m.start() - 60)
        hits.append({"kind": "content", "course_id": l["course_id"],
                     "title": l["title"], "lesson_id": l["lesson_id"],
                     "chapter": l.get("chapter"),
                     "snippet": "…" + l["explanation"][start:start + 160] + "…"})
    return {"query": q, "results": hits[:40]}
