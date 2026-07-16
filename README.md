# Leaflet — PDF to E-Course Learning Platform

Upload any PDF (book, research paper, study material, documentation) and Leaflet converts it into a structured, interactive learning course — with lessons, quizzes, persistent progress, and an AI learning companion grounded in your document.

**Live demo:** `https://your-app.vercel.app` · **API:** `https://your-api.onrender.com/api/health`

## Architecture

```
┌──────────────────┐        Bearer ID token         ┌──────────────────────┐
│  React + Vite    │ ─────────────────────────────► │  FastAPI (Render)    │
│  Tailwind CSS    │      REST /api/*               │                      │
│  (Vercel)        │ ◄───────────────────────────── │  PyMuPDF  extraction │
└───────┬──────────┘                                │  Groq LLaMA 3.3 70B  │
        │ Google Sign-In                            │  Firebase Admin auth │
        ▼                                           └──────────┬───────────┘
┌──────────────────┐                                           │ motor (async)
│  Firebase Auth   │                                           ▼
└──────────────────┘                                ┌──────────────────────┐
                                                    │   MongoDB Atlas      │
                                                    │ users · documents ·  │
                                                    │ courses · lessons ·  │
                                                    │ progress · chats ·   │
                                                    │ quizzes · attempts   │
                                                    └──────────────────────┘
```

### AI pipeline (the interesting part)

1. **Extraction** — PyMuPDF pulls text page-by-page; pages are grouped into ~9k-character chunks with page-range metadata. Handles large multi-page PDFs without loading images.
2. **Digest** — each chunk is condensed to a ≤150-word factual digest (very large PDFs are sampled evenly, capped at 24 chunks).
3. **Outline** — one JSON-mode call turns the combined digest into the full course skeleton: title, description, estimated time, objectives, prerequisites, difficulty, and chapters → topics → lessons with stable IDs.
4. **Lazy lesson generation** — lesson *content* (explanation, key takeaways, important notes, real-world examples, summary) is generated the **first time a learner opens it**, then cached in MongoDB. This keeps upload fast, respects Groq's free-tier rate limits, and never spends tokens on lessons nobody opens. A deliberate scalability decision.
5. **Companion chat** — lightweight retrieval (keyword-scored chunk ranking) selects the 3 most relevant source excerpts per question; the course TOC plus the last 8 chat turns are included for context-aware conversation. All history persists.
6. **Quizzes** — generated per chapter (3 MCQ, 2 true/false, 1 short answer) in JSON mode, cached, scored server-side with explanations. Short answers are matched leniently on key terms.

## Features checklist

- Google OAuth + GitHub OAuth (Firebase) with per-user dashboard and history
- PDF upload with validation (type, 25 MB limit, encrypted/scanned-PDF detection), background course generation with polled status
- Full course structure: title, description, estimated time, objectives, prerequisites, difficulty, TOC (chapters → topics → lessons)
- Each lesson: structured explanation, key takeaways, important notes, real-world examples, summary
- Progress: mark complete, chapter/course completion %, resume point, time-spent tracking, learning streak — all persisted
- AI companion: explain concepts, summarize chapters, on-demand quizzes, next-lesson suggestions, follow-up questions
- Quiz generation with correct answers, score, and explanations; attempt history
- Dashboard: courses, completion, time learning, streak, recent quiz scores
- Search across chapters, topics, lessons and generated lesson content
- Responsive UI (mobile TOC toggle, slide-over chat), keyboard-focus styles, reduced-motion respected

## Local setup

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # fill in GROQ_API_KEY, MONGODB_URI, FIREBASE_SERVICE_ACCOUNT_JSON
uvicorn app.main:app --reload --port 8000
```
Interactive API docs at `http://localhost:8000/docs`.

### Frontend
```bash
cd frontend
npm install
cp .env.example .env      # fill in VITE_API_URL + Firebase web config
npm run dev               # http://localhost:5173
```

### Credentials you need (all free)
1. **Groq** — create an API key at console.groq.com.
2. **MongoDB Atlas** — free M0 cluster; copy the connection string into `MONGODB_URI`.
3. **Firebase** — create a project, enable **Google** and **GitHub** sign-in under Authentication (for GitHub: create an OAuth App at github.com → Settings → Developer settings, using the callback URL Firebase shows, and paste the Client ID/Secret into Firebase), copy the web config into the frontend `.env`; then Project settings → Service accounts → *Generate new private key*, and paste the JSON (single line) into `FIREBASE_SERVICE_ACCOUNT_JSON`.

## Deployment

- **Backend → Render**: new Web Service from the `backend/` directory (a `render.yaml` blueprint is included). Set the four env vars. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- **Frontend → Vercel**: import the repo, root directory `frontend/`, framework Vite. Set the `VITE_*` env vars with the deployed API URL.
- Add the Vercel domain to `ALLOWED_ORIGINS` on Render **and** to Firebase Authentication → Authorized domains.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/documents` | Upload PDF, start background course generation |
| GET | `/api/courses` | List my courses with completion stats |
| GET | `/api/courses/{id}` | Course outline + my progress |
| GET | `/api/courses/{id}/lessons/{lid}` | Lesson content (lazy-generated, cached) |
| POST | `/api/courses/{id}/lessons/{lid}/complete` | Mark complete + record time spent |
| POST | `/api/courses/{id}/resume` | Save resume point |
| GET | `/api/progress/summary` | Dashboard stats (time, streak, quiz scores) |
| GET/POST | `/api/courses/{id}/chat` | Companion history / send message |
| POST | `/api/courses/{id}/chapters/{n}/quiz` | Get or generate chapter quiz |
| POST | `/api/quizzes/{id}/submit` | Score answers, store attempt |
| GET | `/api/quizzes/attempts` | Quiz attempt history |
| GET | `/api/search?q=` | Search chapters/topics/lessons/content |

All endpoints require `Authorization: Bearer <Firebase ID token>`.

## Database schema (MongoDB collections)

- `users` — uid, email, name, photo, created_at, last_seen
- `documents` — filename, num_pages, chunks `[{index, pages:[a,b], text}]`
- `courses` — outline (chapters→topics→lessons with ids), status `processing|ready|failed`, digest
- `lessons` — cached generated content keyed by (course_id, lesson_id)
- `progress` — completed lesson ids, time_spent_seconds, last_lesson_id, activity log
- `chats` — role, content, at, per (uid, course_id)
- `quizzes` / `quiz_attempts` — questions with answers+explanations / scored results

## Design notes

Light "paper and highlighter" identity built for reading: Sora display + Atkinson Hyperlegible body (a typeface designed for legibility — fitting for a learning product). The signature element is the **highlighter swipe**: completed lessons get a marker stroke in a book-style table of contents with dotted leaders, so your progress literally looks like a well-studied book.

## Roadmap / bonus ideas

Vector retrieval (ChromaDB) to replace keyword scoring · streaming chat responses · flashcards · TTS narration · course certificates · multi-language output.
