"""
LLM Provider Abstraction and Ollama Provider for AegisGraph AI.
Supports Qwen 3 (default: qwen3:8b) running via local Ollama.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, Generator, List, Optional


class LLMProvider(ABC):
    """Abstract base class for local and remote LLM providers."""

    @abstractmethod
    def health_check(self) -> Dict[str, Any]:
        """Checks if the provider and configured model are operational."""
        pass

    @abstractmethod
    def generate(self, messages: List[Dict[str, str]], options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Synchronously generates a complete chat completion."""
        pass

    @abstractmethod
    def stream(self, messages: List[Dict[str, str]], options: Optional[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        """Streams chat completion tokens from the model."""
        pass


class OllamaProvider(LLMProvider):
    """
    Ollama implementation for local Qwen 3 inference.
    Communicates over HTTP loopback (default: http://127.0.0.1:11434).
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
        temperature: Optional[float] = None,
        context_size: Optional[int] = None,
        max_output_tokens: Optional[int] = None,
    ):
        raw_url = base_url or os.environ.get("OLLAMA_BASE_URL") or os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
        self.base_url = raw_url.rstrip("/")
        self.model = model or os.environ.get("LLM_MODEL") or os.environ.get("QWEN_MODEL", "qwen3:8b")
        self.timeout = timeout or float(os.environ.get("LLM_TIMEOUT", "180"))
        self.temperature = temperature or float(os.environ.get("LLM_TEMPERATURE", "0.6"))
        self.context_size = context_size or int(os.environ.get("LLM_CONTEXT_SIZE", "8192"))
        self.max_output_tokens = max_output_tokens or int(os.environ.get("LLM_MAX_OUTPUT_TOKENS", "2048"))

    def health_check(self) -> Dict[str, Any]:
        """Queries Ollama /api/tags to check daemon accessibility and model availability."""
        url = f"{self.base_url}/api/tags"
        req = urllib.request.Request(url, headers={"User-Agent": "AegisGraph-AI/1.0"}, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                models = [m.get("name", "") for m in data.get("models", [])]
                
                # Check for exact match, prefix match, or any installed Qwen variant
                model_base = self.model.split(":")[0]
                matching_model = next(
                    (m for m in models if m == self.model or m.startswith(f"{model_base}:")),
                    None
                )
                if not matching_model and "qwen" in self.model.lower():
                    matching_model = next((m for m in models if "qwen" in m.lower()), None)

                if matching_model:
                    self.model = matching_model
                    model_available = True
                else:
                    model_available = False

                return {
                    "status": "online" if model_available else "model_missing",
                    "provider": "ollama",
                    "configured_model": self.model,
                    "ollama_online": True,
                    "model_available": model_available,
                    "installed_models": models,
                    "base_url": self.base_url,
                }
        except Exception as err:
            return {
                "status": "offline",
                "provider": "ollama",
                "configured_model": self.model,
                "ollama_online": False,
                "model_available": False,
                "installed_models": [],
                "base_url": self.base_url,
                "error": str(err),
            }

    def generate(self, messages: List[Dict[str, str]], options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Generates a complete response via Ollama /api/chat."""
        url = f"{self.base_url}/api/chat"
        opts = {
            "temperature": self.temperature,
            "num_predict": self.max_output_tokens,
            "num_ctx": self.context_size,
        }
        if options:
            opts.update(options)

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": opts,
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                content = data.get("message", {}).get("content", "")
                return {
                    "success": True,
                    "content": content,
                    "model": self.model,
                    "provider": "ollama",
                    "total_duration": data.get("total_duration"),
                }
        except urllib.error.URLError as err:
            return {
                "success": False,
                "error": f"Could not connect to Ollama at {self.base_url}. Ensure Ollama is running (`ollama run {self.model}`).",
                "provider": "ollama",
                "model": self.model,
            }
        except Exception as err:
            return {
                "success": False,
                "error": str(err),
                "provider": "ollama",
                "model": self.model,
            }

    def stream(self, messages: List[Dict[str, str]], options: Optional[Dict[str, Any]] = None) -> Generator[Dict[str, Any], None, None]:
        """Streams tokens from Ollama /api/chat."""
        url = f"{self.base_url}/api/chat"
        opts = {
            "temperature": self.temperature,
            "num_predict": self.max_output_tokens,
            "num_ctx": self.context_size,
        }
        if options:
            opts.update(options)

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": opts,
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if not line_str:
                        continue
                    try:
                        chunk_obj = json.loads(line_str)
                        delta = chunk_obj.get("message", {}).get("content", "")
                        done = chunk_obj.get("done", False)
                        yield {
                            "delta": delta,
                            "done": done,
                            "model": self.model,
                        }
                        if done:
                            break
                    except Exception:
                        continue
        except Exception as err:
            yield {
                "delta": "",
                "done": True,
                "error": str(err),
                "model": self.model,
            }


# Singleton factory
_provider_instance: Optional[LLMProvider] = None


def get_llm_provider() -> LLMProvider:
    """Returns the configured LLMProvider instance."""
    global _provider_instance
    if _provider_instance is None:
        provider_type = os.environ.get("LLM_PROVIDER", "ollama").lower()
        if provider_type == "ollama":
            _provider_instance = OllamaProvider()
        else:
            _provider_instance = OllamaProvider()
    return _provider_instance
