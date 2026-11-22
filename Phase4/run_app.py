"""
AegisGraph AI / GraphOps — Render & Local Application Entrypoint for Phase4.
"""
import os
import sys
import argparse

PHASE4_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(PHASE4_DIR)
for p in [PHASE4_DIR, ROOT_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(ROOT_DIR, ".env.local"))
    load_dotenv(os.path.join(ROOT_DIR, ".env"))
    load_dotenv(os.path.join(PHASE4_DIR, ".env.local"))
    load_dotenv(os.path.join(PHASE4_DIR, ".env"))
except ImportError:
    pass

# Set safe defaults for Render/Cloud deployment
os.environ.setdefault("VECTOR_BACKEND", "local")
os.environ.setdefault("AUTH_MODE", "demo")
os.environ.setdefault("SERVE_FRONTEND", "true")
os.environ.setdefault("LLM_MODEL", "qwen3:8b")
os.environ.setdefault("QWEN_MODEL", "qwen3:8b")

import uvicorn

def main():
    default_port = int(os.environ.get("PORT", 8080))
    default_host = os.environ.get("HOST", "0.0.0.0")

    parser = argparse.ArgumentParser(description="AegisGraph AI / GraphOps Runner")
    parser.add_argument("--host", default=default_host, help=f"Host IP to bind (default: {default_host})")
    parser.add_argument("--port", type=int, default=default_port, help=f"Port to bind (default: {default_port})")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    args = parser.parse_args()

    port = int(os.environ.get("PORT", args.port))
    host = os.environ.get("HOST", args.host)

    print(f"==================================================================")
    print(f" Starting AegisGraph / GraphOps Backend on port {port}")
    print(f" API Docs:   http://{host}:{port}/docs")
    print(f"==================================================================")

    uvicorn.run("backend.app:app", host=host, port=port, reload=args.reload)

if __name__ == "__main__":
    main()
