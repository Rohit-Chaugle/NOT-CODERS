"""Pluggable LLM providers for the Generative AI layer.

The provider is picked from environment variables so the same build works with
OpenAI, Google Gemini, Anthropic, or — when no API key is present — a
template-based generator that keeps every AI endpoint functional offline.

    VERDANT_LLM_PROVIDER   auto | openai | gemini | anthropic | template
    VERDANT_OPENAI_API_KEY / OPENAI_API_KEY            (+ VERDANT_OPENAI_MODEL)
    VERDANT_GEMINI_API_KEY / GEMINI_API_KEY            (+ VERDANT_GEMINI_MODEL)
    VERDANT_ANTHROPIC_API_KEY / ANTHROPIC_API_KEY      (+ VERDANT_ANTHROPIC_MODEL)

Only the standard library is used for HTTP, so no provider SDK is required.
`resolve()` returns a provider (or None for template mode); `complete()` never
raises — a failure degrades to the template path in app.services.copilot.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass

from app.config import (
    ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LLM_MAX_TOKENS,
    LLM_PROVIDER,
    LLM_TEMPERATURE,
    LLM_TIMEOUT,
    OPENAI_API_KEY,
    OPENAI_MODEL,
)

logger = logging.getLogger("verdant.llm")


@dataclass(frozen=True)
class ProviderInfo:
    """What the UI needs to describe the active engine."""

    name: str  # openai | gemini | anthropic | template
    model: str | None
    live: bool  # True only when a real API key is configured
    detail: str = ""

    def to_dict(self) -> dict:
        return {"name": self.name, "model": self.model, "live": self.live, "detail": self.detail}


@dataclass
class Completion:
    text: str
    provider: str
    model: str | None
    fallback: bool  # True when the template path should be used instead
    error: str | None = None


def _post_json(url: str, payload: dict, headers: dict[str, str], timeout: float) -> tuple[dict | None, str | None]:
    """POST JSON and decode the reply. Returns (data, error) — never raises."""
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8")), None
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", "replace")[:300]
        except Exception:  # pragma: no cover - defensive
            pass
        return None, f"HTTP {exc.code} {detail}".strip()
    except Exception as exc:  # network, DNS, timeout, bad JSON…
        return None, f"{exc.__class__.__name__}: {exc}"


class Provider:
    name = "base"
    model: str | None = None

    def complete(self, system: str, prompt: str, *, json_mode: bool = False) -> str:
        raise NotImplementedError


class OpenAIProvider(Provider):
    name = "openai"

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    def complete(self, system: str, prompt: str, *, json_mode: bool = False) -> str:
        payload: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": LLM_TEMPERATURE,
            "max_tokens": LLM_MAX_TOKENS,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        data, error = _post_json(
            "https://api.openai.com/v1/chat/completions",
            payload,
            {"Authorization": f"Bearer {self.api_key}"},
            LLM_TIMEOUT,
        )
        if error or not data:
            raise RuntimeError(error or "empty response")
        return data["choices"][0]["message"]["content"]


class GeminiProvider(Provider):
    name = "gemini"

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    def complete(self, system: str, prompt: str, *, json_mode: bool = False) -> str:
        generation: dict = {
            "temperature": LLM_TEMPERATURE,
            "maxOutputTokens": LLM_MAX_TOKENS,
        }
        if json_mode:
            generation["responseMimeType"] = "application/json"
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": generation,
        }
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        data, error = _post_json(url, payload, {}, LLM_TIMEOUT)
        if error or not data:
            raise RuntimeError(error or "empty response")
        return data["candidates"][0]["content"]["parts"][0]["text"]


class AnthropicProvider(Provider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    def complete(self, system: str, prompt: str, *, json_mode: bool = False) -> str:
        # Anthropic has no JSON mode switch — instruct it in the system prompt.
        if json_mode:
            system = f"{system}\n\nRespond with a single valid JSON object and nothing else."
        payload = {
            "model": self.model,
            "max_tokens": LLM_MAX_TOKENS,
            "temperature": LLM_TEMPERATURE,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
        }
        data, error = _post_json(
            "https://api.anthropic.com/v1/messages",
            payload,
            {"x-api-key": self.api_key, "anthropic-version": "2023-06-01"},
            LLM_TIMEOUT,
        )
        if error or not data:
            raise RuntimeError(error or "empty response")
        return data["content"][0]["text"]


import os

def _get_candidates() -> list[tuple[str, str, str]]:
    from app.config import (
        ANTHROPIC_MODEL,
        GEMINI_MODEL,
        OPENAI_MODEL,
    )
    openai_key = os.getenv("VERDANT_OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY", "")
    gemini_key = (
        os.getenv("VERDANT_GEMINI_API_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY", "")
    )
    anthropic_key = os.getenv("VERDANT_ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY", "")

    openai_model = os.getenv("VERDANT_OPENAI_MODEL", OPENAI_MODEL)
    gemini_model = os.getenv("VERDANT_GEMINI_MODEL", GEMINI_MODEL)
    anthropic_model = os.getenv("VERDANT_ANTHROPIC_MODEL", ANTHROPIC_MODEL)

    return [
        ("openai", openai_key, openai_model),
        ("gemini", gemini_key, gemini_model),
        ("anthropic", anthropic_key, anthropic_model),
    ]


_BUILDERS = {
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
    "anthropic": AnthropicProvider,
}

_cache: tuple[Provider | None, ProviderInfo] | None = None


def reset_cache() -> None:
    """Clear cached provider resolution."""
    global _cache
    _cache = None


def resolve(force_refresh: bool = False) -> tuple[Provider | None, ProviderInfo]:
    """Return the configured provider (None ⇒ template mode) and its info."""
    global _cache
    if force_refresh:
        _cache = None
    if _cache is not None:
        return _cache

    candidates = _get_candidates()
    provider_pref = os.getenv("VERDANT_LLM_PROVIDER", LLM_PROVIDER).strip().lower()

    if provider_pref not in {"auto", "template", ""}:
        match = next((entry for entry in candidates if entry[0] == provider_pref), None)
        if match is None:
            _cache = (None, ProviderInfo("template", None, False, f"unknown provider {provider_pref!r}"))
        elif not match[1]:
            _cache = (None, ProviderInfo("template", None, False, f"{match[0]} selected but no API key set"))
        else:
            _cache = (_BUILDERS[match[0]](match[1], match[2]), ProviderInfo(match[0], match[2], True))
        return _cache

    if provider_pref == "template":
        _cache = (None, ProviderInfo("template", None, False, "template provider forced by config"))
        return _cache

    for name, key, model in candidates:  # auto: first key wins
        if key:
            _cache = (_BUILDERS[name](key, model), ProviderInfo(name, model, True))
            return _cache

    _cache = (None, ProviderInfo("template", None, False, "no API key configured (using offline template engine)"))
    return _cache


def info() -> ProviderInfo:
    return resolve()[1]


def complete(system: str, prompt: str, *, json_mode: bool = False) -> Completion:
    """Run a completion. On any failure the caller should use its template path."""
    provider, provider_info = resolve()
    if provider is None:
        return Completion("", "template", None, fallback=True, error=provider_info.detail)

    try:
        text = provider.complete(system, prompt, json_mode=json_mode)
    except Exception as exc:
        logger.warning("LLM %s failed: %s", provider.name, exc)
        return Completion("", provider.name, provider.model, fallback=True, error=str(exc))

    if not text or not text.strip():
        return Completion("", provider.name, provider.model, fallback=True, error="empty completion")
    return Completion(text, provider.name, provider.model, fallback=False)


def extract_json(text: str) -> object | None:
    """Pull the first JSON object/array out of a model reply, tolerating fences."""
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1] if "```" in cleaned[3:] else cleaned[3:]
        if cleaned.lstrip().startswith("json"):
            cleaned = cleaned.lstrip()[4:]
    for opener, closer in (("{", "}"), ("[", "]")):
        start = cleaned.find(opener)
        end = cleaned.rfind(closer)
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                continue
    return None
