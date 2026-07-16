from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .services.llm import LLMError
from . import config
from .routers import documents, courses, progress, chat, quiz, search

app = FastAPI(title="Leaflet — PDF to E-Course API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (documents.router, courses.router, progress.router,
          chat.router, quiz.router, search.router):
    app.include_router(r)


@app.exception_handler(LLMError)
async def llm_error_handler(request: Request, exc: LLMError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/api/health")
async def health():
    return {"ok": True}