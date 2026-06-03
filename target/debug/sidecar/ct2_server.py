#!/usr/bin/env python3
"""
ct2_server.py — CTranslate2 NMT sidecar for BlinkStream (Python).

RF-14:   CTranslate2 as managed JSON IPC subprocess
RNF-14:  Independent of Rust toolchain — JSON over stdin/stdout
§4.4:    Single JSON line protocol over stdin/stdout

Requires: pip install ctranslate2

Usage:
  echo '{"command":"load_model","model_path":"...","src_lang":"en","tgt_lang":"es"}' | python ct2_server.py
  echo '{"command":"translate","text":"Hello world","id":1}' | python ct2_server.py
  echo '{"command":"ping"}' | python ct2_server.py
  echo '{"command":"shutdown"}' | python ct2_server.py

Protocol — same as C++ version:
  Commands:  load_model, translate, ping, shutdown
  Responses: loaded, ok, error, pong, shutting_down
"""

import sys
import json
import logging
import signal
from typing import Optional

# Configure logging to stderr (stdout is reserved for JSON responses)
logging.basicConfig(
    level=logging.INFO,
    format="[ct2_server] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger(__name__)

# ─── Translator wrapper ────────────────────────────────────

class Translator:
    """Wrapper around ctranslate2.Translator with lazy loading."""

    def __init__(self):
        self._translator = None
        self._src_lang = ""
        self._tgt_lang = ""
        self._loaded = False

    def load_model(self, model_path: str, src_lang: str = "en", tgt_lang: str = "es"):
        """Load a CTranslate2 model from disk.

        Args:
            model_path: Path to the CTranslate2 model directory
            src_lang: Source language code
            tgt_lang: Target language code
        """
        import ctranslate2

        if not model_path:
            raise ValueError("model_path cannot be empty")

        log.info(f"Loading model: {model_path} ({src_lang} -> {tgt_lang})")
        self._translator = ctranslate2.Translator(model_path)
        self._src_lang = src_lang
        self._tgt_lang = tgt_lang
        self._loaded = True
        log.info(f"Model loaded successfully")

    def translate(self, text: str) -> str:
        """Translate a single text segment.

        Args:
            text: Input text to translate

        Returns:
            Translated text
        """
        if not self._loaded or self._translator is None:
            raise RuntimeError("No model loaded. Send load_model first.")

        if not text:
            return ""

        # Tokenize: split by whitespace
        tokens = text.split()

        # Run inference (batch of 1)
        results = self._translator.translate_batch(
            [tokens],
            beam_size=4,
            max_length=200,
            length_penalty=1.0,
            sampling_topk=1,
        )

        # Extract result: first hypothesis of first batch
        if not results or not results[0].hypotheses:
            raise RuntimeError("CTranslate2 returned empty result")

        output_tokens = results[0].hypotheses[0]

        # Detokenize: join with space, clean SentencePiece artifacts
        translated = self._detokenize(output_tokens)

        log.info(f"Translated: \"{text[:60]}{'...' if len(text) > 60 else ''}\" "
                 f"-> \"{translated[:60]}{'...' if len(translated) > 60 else ''}\"")

        return translated

    def is_loaded(self) -> bool:
        return self._loaded

    @staticmethod
    def _detokenize(tokens):
        """Join tokens and clean SentencePiece artifacts (▁ prefix)."""
        result = ""
        for i, t in enumerate(tokens):
            # Remove SentencePiece "▁" prefix (U+2581)
            t_clean = t.replace("\u2581", "")

            if i > 0 and t_clean and t_clean[0] not in "'.,?!;:)]}%":
                result += " "
            result += t_clean
        return result


# ─── Command handler ───────────────────────────────────────

def handle_command(request: dict, translator: Translator) -> dict:
    """Process a single command and return response.

    Args:
        request: Parsed JSON command
        translator: Translator instance

    Returns:
        JSON-serializable response dict
    """
    cmd = request.get("command", "")

    if cmd == "load_model":
        try:
            model_path = request["model_path"]
            src_lang = request.get("src_lang", "en")
            tgt_lang = request.get("tgt_lang", "es")

            translator.load_model(model_path, src_lang, tgt_lang)

            return {
                "status": "loaded",
                "model": model_path,
                "src_lang": src_lang,
                "tgt_lang": tgt_lang,
            }
        except Exception as e:
            return {"status": "error", "message": f"load_model failed: {e}"}

    elif cmd == "translate":
        try:
            text = request["text"]
            cmd_id = request.get("id", 0)

            translated = translator.translate(text)

            return {
                "status": "ok",
                "result": translated,
                "id": cmd_id,
            }
        except Exception as e:
            return {"status": "error", "message": f"translate failed: {e}"}

    elif cmd == "ping":
        return {"status": "pong"}

    elif cmd == "shutdown":
        return {"status": "shutting_down"}

    else:
        return {"status": "error", "message": f"Unknown command: {cmd}"}


# ─── Main loop ─────────────────────────────────────────────

def main():
    """Main entry point: read JSON lines from stdin, write responses to stdout."""
    # Signal handling for clean shutdown
    running = True

    def signal_handler(signum, frame):
        nonlocal running
        running = False
        log.info("Received signal, shutting down...")

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Ensure stdout is line-buffered for proper JSON IPC
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, line_buffering=True)

    translator = Translator()
    log.info("Sidecar started, waiting for commands...")

    for line in sys.stdin:
        if not running:
            break

        line = line.strip()
        if not line:
            continue

        log.info(f"<- {line}")

        response = {}
        try:
            request = json.loads(line)
            response = handle_command(request, translator)
        except json.JSONDecodeError as e:
            response = {"status": "error", "message": f"JSON parse error: {e}"}
        except Exception as e:
            response = {"status": "error", "message": f"Unexpected error: {e}"}

        output = json.dumps(response)
        print(output, flush=True)
        log.info(f"-> {output}")

        if response.get("status") == "shutting_down":
            break

    log.info("Exiting cleanly.")


if __name__ == "__main__":
    main()
