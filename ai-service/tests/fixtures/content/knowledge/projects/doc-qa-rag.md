---
title: Document Q&A with RAG
project: doc-qa-rag
---

# Document Q&A with RAG

> PLACEHOLDER deep-dive — replace with your real project.

## Problem

Long PDFs (policies, manuals, papers) are hard to search. Keyword search misses paraphrases and
pure vector search misses exact terms like part numbers.

## Approach

1. Parse PDFs, keep page numbers, and split into overlapping, heading-aware chunks.
2. Index each chunk twice: BM25 for exact terms and sentence-transformer embeddings in FAISS.
3. Fuse the two rankings with reciprocal-rank fusion, then re-rank the top 20 with a
   cross-encoder.
4. Generate an answer that cites page numbers, and refuse when nothing relevant was retrieved.

## Evaluation

Built a small labelled set of question → relevant-page pairs. Hybrid retrieval with re-ranking
improved Recall@5 by 18% over dense-only retrieval (placeholder number).

## Stack

Python, sentence-transformers, FAISS, rank-bm25, FastAPI, Streamlit.
