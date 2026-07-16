"""AI course generation pipeline.

Strategy for large PDFs (deliberate scalability decision):
1. Each chunk (~9k chars) is condensed to a short digest.
2. One outline call turns the combined digest into the full course skeleton
   (title, description, objectives, chapters -> topics -> lessons).
3. Lesson CONTENT is generated lazily the first time a learner opens it,
   then cached in MongoDB. This keeps upload fast and avoids burning the
   Groq rate limit on lessons nobody has opened yet.
"""
from . import llm

DIGEST_SYSTEM = (
    "You are an expert instructional designer. Condense the given document excerpt "
    "into a dense factual digest of at most 150 words. Keep every key concept, "
    "definition, number and named entity. No commentary."
)

OUTLINE_SYSTEM = """You are an expert curriculum architect. You turn source material into a structured e-learning course.
Respond with ONLY a valid JSON object, no markdown, matching exactly this schema:
{
  "title": string,
  "description": string (2-3 sentences),
  "estimated_minutes": integer,
  "difficulty": "Beginner" | "Intermediate" | "Advanced",
  "objectives": [string, ...] (4-6 items, action verbs),
  "prerequisites": [string, ...] (0-4 items),
  "chapters": [
    {
      "title": string,
      "summary": string (1 sentence),
      "topics": [
        {
          "title": string,
          "lessons": [ { "title": string, "subtopic": string } ]
        }
      ]
    }
  ]
}
Rules:
- 3 to 6 chapters, each with 1-3 topics, each topic with 1-3 lessons.
- Follow the logical order of the source material.
- Titles must be specific to THIS document, never generic like "Introduction to the topic".
"""

LESSON_SYSTEM = """You are a patient expert teacher writing one self-contained lesson for an e-learning platform.
Respond with ONLY valid JSON matching this schema:
{
  "explanation": string (400-700 words of well-structured markdown: short paragraphs, ## subheadings, bullet lists where helpful),
  "key_takeaways": [string, ...] (3-5 items),
  "important_notes": [string, ...] (1-3 warnings, caveats or exam-relevant points),
  "real_world_examples": [string, ...] (2-3 concrete examples),
  "summary": string (2-3 sentences)
}
Ground everything strictly in the provided source material. If the source lacks detail, teach the concept correctly from general knowledge but stay on-topic. Never mention "the PDF" or "the source"."""

QUIZ_SYSTEM = """You are an assessment designer. Create a quiz for the given chapter.
Respond with ONLY valid JSON:
{
  "questions": [
    {
      "type": "mcq" | "true_false" | "short_answer",
      "question": string,
      "options": [string, string, string, string] (only for mcq),
      "answer": string (for mcq: the exact correct option text; for true_false: "True" or "False"; for short_answer: a model answer of max 15 words),
      "explanation": string (1-2 sentences why the answer is correct)
    }
  ]
}
Create exactly 6 questions: 3 mcq, 2 true_false, 1 short_answer. Test understanding, not trivia. Base every question on the chapter material."""


DIGEST_MODEL = "llama-3.1-8b-instant"  # digests don't need 70B; ~5x faster


def digest_chunks(chunks: list[dict], cap: int = 24) -> str:
    """Condense chunks into a single digest, 4 at a time on a fast small model.
    Very large PDFs are sampled evenly."""
    if len(chunks) > cap:
        step = len(chunks) / cap
        chunks = [chunks[int(i * step)] for i in range(cap)]

    def one(c):
        summary = llm.chat(
            [{"role": "system", "content": DIGEST_SYSTEM},
             {"role": "user", "content": c["text"][:12000]}],
            temperature=0.2, max_tokens=400, model=DIGEST_MODEL,
        )
        return f"[pages {c['pages'][0]}-{c['pages'][1]}] {summary}"

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=4) as pool:
        parts = list(pool.map(one, chunks))
    return "\n\n".join(parts)


def generate_outline(digest: str, filename: str) -> dict:
    outline = llm.chat_json(
        OUTLINE_SYSTEM,
        f'Source document: "{filename}"\n\nDigest of the document:\n\n{digest}',
        temperature=0.3, max_tokens=6000,
    )
    # Assign stable ids + map chapters to chunk ranges proportionally
    for ci, ch in enumerate(outline.get("chapters", [])):
        ch["id"] = f"c{ci}"
        for ti, tp in enumerate(ch.get("topics", [])):
            tp["id"] = f"c{ci}-t{ti}"
            for li, ls in enumerate(tp.get("lessons", [])):
                ls["id"] = f"c{ci}-t{ti}-l{li}"
    return outline


def chapter_chunk_range(outline: dict, chapter_index: int, num_chunks: int) -> tuple[int, int]:
    """Proportionally map a chapter to a slice of the document's chunks."""
    n = max(1, len(outline.get("chapters", [])))
    per = max(1, num_chunks // n)
    start = min(chapter_index * per, max(0, num_chunks - 1))
    end = num_chunks if chapter_index == n - 1 else min(start + per + 1, num_chunks)
    return start, end


def generate_lesson(course_title: str, chapter_title: str, topic_title: str,
                    lesson: dict, source_text: str) -> dict:
    user = (
        f"Course: {course_title}\nChapter: {chapter_title}\nTopic: {topic_title}\n"
        f"Lesson to write: {lesson['title']} — {lesson.get('subtopic', '')}\n\n"
        f"Source material:\n{source_text[:14000]}"
    )
    return llm.chat_json(LESSON_SYSTEM, user, temperature=0.4, max_tokens=5000)


def generate_quiz(course_title: str, chapter: dict, source_text: str) -> dict:
    lesson_titles = ", ".join(
        ls["title"] for tp in chapter.get("topics", []) for ls in tp.get("lessons", [])
    )
    user = (
        f"Course: {course_title}\nChapter: {chapter['title']}\n"
        f"Lessons covered: {lesson_titles}\n\nChapter source material:\n{source_text[:14000]}"
    )
    return llm.chat_json(QUIZ_SYSTEM, user, temperature=0.4, max_tokens=4000)