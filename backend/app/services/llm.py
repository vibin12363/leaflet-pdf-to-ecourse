import json
import re
import time
from groq import Groq
from .. import config

_client = Groq(api_key=config.GROQ_API_KEY)

FALLBACK_MODEL = "llama-3.1-8b-instant"  # separate daily quota from the 70B


class LLMError(Exception):
    """Clean, user-facing AI error. Never contains raw provider payloads."""


def _friendly_rate_limit(err_text: str) -> str:
    m = re.search(r"try again in ([\dhms\.]+)", err_text)
    wait = m.group(1) if m else "a little while"
    return f"Daily AI usage limit reached. Please try again in about {wait}."


def chat(messages: list[dict], temperature: float = 0.4, max_tokens: int = 4096,
         json_mode: bool = False, model: str | None = None) -> str:
    kwargs = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    current = model or config.GROQ_MODEL

    for attempt in range(4):
        try:
            resp = _client.chat.completions.create(
                model=current,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs,
            )
            return resp.choices[0].message.content
        except Exception as e:
            text = str(e)
            is_rate = "rate_limit" in text or "429" in text
            is_daily = is_rate and ("per day" in text or "TPD" in text)

            if is_daily:
                # daily quota exhausted on this model: fall back once to the
                # smaller model, which has its own separate daily allowance
                if current != FALLBACK_MODEL:
                    current = FALLBACK_MODEL
                    continue
                raise LLMError(_friendly_rate_limit(text))

            if is_rate:  # per-minute limit: back off and retry
                if attempt == 3:
                    raise LLMError("The AI is receiving too many requests right now. Please try again in a minute.")
                time.sleep(3 * (attempt + 1))
                continue

            if attempt == 3:
                raise LLMError("The AI service is temporarily unavailable. Please try again.")
            time.sleep(2 * (attempt + 1))

    raise LLMError("The AI service is temporarily unavailable. Please try again.")


def chat_json(system: str, user: str, temperature: float = 0.3, max_tokens: int = 6000) -> dict:
    """Ask for strict JSON and parse defensively (strips markdown fences if present)."""
    raw = chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
        json_mode=True,
    )
    cleaned = re.sub(r"^```(json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise LLMError("The AI returned an unexpected format. Please retry.")