import fitz  # PyMuPDF

MAX_CHUNK_CHARS = 9000


def extract_pages(data: bytes) -> list[str]:
    """Extract text page by page. Handles large multi-page PDFs without loading images."""
    pages = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for page in doc:
            pages.append(page.get_text("text"))
    return pages


def build_chunks(pages: list[str]) -> list[dict]:
    """Group pages into ~9k-char chunks, remembering which pages each chunk covers."""
    chunks, buf, start = [], "", 1
    for i, text in enumerate(pages, start=1):
        if buf and len(buf) + len(text) > MAX_CHUNK_CHARS:
            chunks.append({"index": len(chunks), "pages": [start, i - 1], "text": buf.strip()})
            buf, start = "", i
        buf += text + "\n"
    if buf.strip():
        chunks.append({"index": len(chunks), "pages": [start, len(pages)], "text": buf.strip()})
    return chunks


def keyword_retrieve(chunks: list[dict], query: str, top_k: int = 3) -> list[dict]:
    """Lightweight retrieval: score chunks by keyword overlap with the query."""
    terms = {t.lower() for t in query.split() if len(t) > 3}
    if not terms:
        return chunks[:top_k]
    scored = []
    for c in chunks:
        low = c["text"].lower()
        score = sum(low.count(t) for t in terms)
        scored.append((score, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for s, c in scored[:top_k] if s > 0] or chunks[:top_k]
