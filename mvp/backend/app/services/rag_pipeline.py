"""
RAG Pipeline: embedding -> ChromaDB search -> prompt assembly.
Reuses existing knowledge_loader.py for knowledge base access.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Add project root to path so we can import knowledge_loader
_PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from knowledge_loader import KnowledgeLoader


class RagPipeline:
    def __init__(self) -> None:
        self.loader = KnowledgeLoader(knowledge_dir=str(_PROJECT_ROOT / ".knowledge"))
        self._loaded = False

    def ensure_loaded(self) -> None:
        if self._loaded:
            return
        self.loader.load_all()
        self._loaded = True

    def search(self, query: str, top_k: int = 3) -> list[dict[str, Any]]:
        self.ensure_loaded()
        try:
            results = self.loader.semantic_search(query, top_k=top_k)
        except Exception:
            results = self.loader.search(query, top_k=top_k)

        return [
            {
                "kb_name": r.kb_name,
                "title": r.title,
                "snippet": r.snippet,
                "score": r.score,
            }
            for r in results
        ]

    def build_rag_context(self, query: str, max_chars: int = 2000, top_k: int = 3) -> str:
        self.ensure_loaded()
        return self.loader.get_context(query, max_chars=max_chars, top_k=top_k)


rag_pipeline = RagPipeline()
