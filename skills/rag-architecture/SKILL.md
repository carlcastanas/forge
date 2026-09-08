---
name: rag-architecture
description: Design a retrieval-augmented generation pipeline that answers from sources — chunking, embedding choice, hybrid retrieval with reranking, context assembly under a token budget, citation fidelity, and evaluating retrieval separately from generation. Use when the user asks to build or fix a RAG system, a document Q&A feature, vector search quality, chunking strategy, or "the model is not finding the right documents".
metadata:
  origin: FORGE
---

# RAG Architecture

> **Drift-prone skill.** Embedding model names, context limits, and vector database
> APIs change often. Verify current model identifiers and index parameters against the
> provider's own documentation before writing configuration.

Retrieval-augmented generation fails in two distinct places, and teams routinely debug
the wrong one. Either the right passage never reached the context window (a retrieval
problem, fixed with chunking, hybrid search, and reranking) or it was present and the
answer still went wrong (a generation problem, fixed with prompt structure and output
constraints). This skill builds the pipeline so those two are measured separately.
Done means: a retrieval metric and a generation metric that move independently, and
answers that carry citations a reader can check.

## When to activate

- Building document search, knowledge-base Q&A, or a support assistant over a corpus
- Retrieval returns plausible-looking but wrong passages
- Answers cite documents that do not contain the claim
- Choosing a vector store, an embedding model, or a chunk size
- Context assembly overruns the window or drops the relevant passage
- User says "RAG", "vector search", "embeddings", "chunking", "reranker",
  "hallucinating citations", "semantic search quality"

## When NOT to use

- The corpus fits in the context window. Load it directly; retrieval adds a failure mode
  for no benefit.
- The question is answerable by a SQL query or a structured filter. Text-to-query beats
  embedding numbers and dates.
- Progressive context refinement inside an agent loop — use
  [iterative-retrieval](../iterative-retrieval/SKILL.md)
- Validating the shape of what the model returns — use
  [llm-output-validation](../llm-output-validation/SKILL.md)
- The corpus is attacker-influenced; read
  [prompt-injection-defense](../prompt-injection-defense/SKILL.md) first, because
  retrieved text is untrusted input

## Prerequisites

- A corpus with stable document identifiers and a way to detect updates
- A vector store (pgvector, Qdrant, Weaviate, LanceDB, or a managed service) and a
  lexical index (Postgres full text, OpenSearch, or BM25 in the same store)
- A labeled question set: 50 to 200 real questions with the passage that answers each.
  Without this, every change is a guess.

## Process

### 1. Chunk along document structure, not by character count

Fixed-size windows cut sentences in half and separate a table from its header. Split on
the document's own boundaries first, then subdivide only what is still too large.

| Corpus | Split on | Target size | Overlap |
| --- | --- | --- | --- |
| Markdown, docs | Headings, then paragraphs | 400-800 tokens | 10-15% |
| Source code | Function or class, via a parser | One symbol per chunk | none |
| Transcripts | Speaker turn, then time window | 300-600 tokens | 1 turn |
| PDFs, reports | Page, then section; tables kept whole | 500-900 tokens | 10% |
| Short records (FAQ, tickets) | One record per chunk | as-is | none |

Prepend the structural path to each chunk's embedded text. A chunk that reads
"the limit is 500 per hour" is unretrievable; "Billing > Rate limits > Free tier — the
limit is 500 per hour" is not.

```python
def to_chunk_text(doc_title: str, heading_path: list[str], body: str) -> str:
    return f"{doc_title} > {' > '.join(heading_path)}\n\n{body}"
```

Store, per chunk: `doc_id`, `chunk_id`, ordinal position, heading path, source URI or
page number, `updated_at`, and any tenancy or access label. The last one is not
optional — filtering by permission at query time requires it on the row.

### 2. Choose an embedding model by the properties that constrain you

Rank the criteria in this order: does it support your language and domain vocabulary,
what is the maximum input length, what dimensionality can the index afford, is it
self-hostable if the data cannot leave, and only then benchmark quality on your own
labeled set. Published leaderboard scores rarely transfer to a specific corpus.

Practical constraints that decide it more often than quality:

- Dimension drives index memory. Some models support truncation to a smaller dimension
  with modest loss; use it when the index will hold tens of millions of vectors.
- Asymmetric models want a query prefix and a document prefix. Using the wrong one
  silently degrades recall.
- Changing the model means re-embedding everything. Store the model identifier and
  version on each row so a partially migrated index is detectable rather than
  mysterious.

```sql
CREATE TABLE chunk (
  chunk_id     text PRIMARY KEY,
  doc_id       text NOT NULL,
  tenant_id    uuid NOT NULL,
  heading_path text[],
  body         text NOT NULL,
  embedding    vector(1024) NOT NULL,
  embed_model  text NOT NULL,
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON chunk USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON chunk USING gin (tsv);
CREATE INDEX ON chunk (tenant_id);
```

### 3. Retrieve hybrid, then rerank

Dense retrieval handles paraphrase; lexical retrieval handles identifiers, error codes,
product names, and rare terms. Systems that use only one fail on the other's cases.

Fuse the two ranked lists with reciprocal rank fusion, which needs no score calibration
between incomparable scoring systems:

```python
def rrf(rank_lists: list[list[str]], k: int = 60) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for ranked in rank_lists:
        for position, chunk_id in enumerate(ranked, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + position)
    return sorted(scores.items(), key=lambda kv: -kv[1])
```

Retrieve wide (50-100 candidates per branch), fuse, then rerank the top 30 to 50 with a
cross-encoder and keep 5 to 10. A cross-encoder reads query and passage together, so it
resolves cases bi-encoders cannot, and it is the single highest-yield addition to a
mediocre RAG pipeline. It is also the latency cost, so cap the candidate count rather
than the model.

Apply permission and tenancy filters inside the vector query, not after. Post-filtering
a top-k result set silently returns fewer results than requested, and returns none at
all for users whose documents ranked below the cut.

### 4. Assemble context within a stated budget

Allocate the window explicitly rather than concatenating until something truncates.

```python
from collections import Counter

BUDGET = {"instructions": 800, "history": 1500, "retrieved": 6000, "reserve_out": 1500}

def assemble(chunks, tokenizer, budget=BUDGET["retrieved"], max_per_doc=3):
    used, out = 0, []
    per_doc = Counter()
    for c in chunks:                       # already reranked, best first
        # cap per-document dominance so one long doc cannot crowd out the rest
        if per_doc[c.doc_id] >= max_per_doc:
            continue
        block = f"[{len(out) + 1}] {c.source_uri}\n{c.body}\n"
        cost = len(tokenizer.encode(block))
        if used + cost > budget:
            break
        out.append(block)
        per_doc[c.doc_id] += 1
        used += cost
    return "\n".join(out), used
```

Rules that change answer quality more than the model choice:

- Deduplicate near-identical chunks before assembly; repeated text biases the answer.
- Merge adjacent chunks from the same document back into a contiguous passage.
- Place the most relevant material at the start and the end of the retrieved block.
  Middle positions are attended to least.
- Number each block and require the answer to cite those numbers.
- Include `updated_at` in the block when recency matters, so the model can prefer the
  newer of two conflicting passages.

### 5. Make citations verifiable, then verify them

Instruct the model to answer only from the numbered blocks and to say when the answer
is absent. Then check the claim mechanically rather than trusting the instruction:

```python
def citation_supported(answer_sentence: str, cited_block: str, judge) -> bool:
    return judge(
        "Is the statement fully supported by the passage? Answer SUPPORTED or NOT_SUPPORTED.\n"
        f"Statement: {answer_sentence}\nPassage: {cited_block}"
    ).strip() == "SUPPORTED"
```

Run this on a sample of production traffic, not on every request, unless the domain
warrants the cost. Track the unsupported rate as a first-class metric; it is the number
that tells you whether the feature can be trusted.

A "no answer in the sources" response is a correct outcome. Include such questions in
the eval set, or the system will be tuned to always produce something.

### 6. Evaluate retrieval and generation as separate stages

| Stage | Metric | Fix when it is low |
| --- | --- | --- |
| Retrieval | recall@k — is the gold passage in the top k | Chunking, hybrid search, query rewriting |
| Ranking | MRR or nDCG over the reranked list | Reranker model, candidate count |
| Assembly | budget utilization, gold-chunk survival rate | Dedup, per-document caps, ordering |
| Generation | answer correctness against a reference | Prompt, model, output constraints |
| Faithfulness | share of claims supported by cited passage | Citation enforcement, stricter refusal instruction |

Retrieval recall is measurable without calling a generation model at all, which makes it
cheap to run on every change. Do that first: if recall@10 is 0.6, no prompt work will
save the answers.

Query rewriting is the usual lever when recall is low and the corpus is fine. Expand
acronyms, generate two or three paraphrases, retrieve for each, and fuse — at the cost
of one extra model call and more latency.

For harness structure, graders, and CI gating, see
[model-evaluation-harness](../model-evaluation-harness/SKILL.md).

### 7. Keep the index honest as the corpus changes

- Re-embed on content change only, keyed by a content hash, not on every sync.
- Delete chunks when the source document is deleted. Orphaned chunks produce citations
  to pages that 404.
- Version the embedding model on the row; migrate by writing a new column or a parallel
  index, then cutting over, never by mutating in place.
- Track index freshness lag as an operational metric alongside latency and error rate.

## Checklist

- [ ] Chunks split on document structure, with heading path prepended to embedded text
- [ ] Chunk rows carry tenancy or permission labels, filtered inside the vector query
- [ ] Both dense and lexical retrieval run, fused by rank rather than raw score
- [ ] A cross-encoder reranker narrows candidates before assembly
- [ ] Context budget is allocated explicitly, with a per-document cap and dedup
- [ ] Retrieved blocks are numbered and the prompt requires citations to those numbers
- [ ] "Not in the sources" is an allowed and tested answer
- [ ] Labeled question set of 50+ items exists, with the gold passage per question
- [ ] recall@k measured on every retrieval change, without invoking generation
- [ ] Faithfulness sampled in production and tracked over time
- [ ] Embedding model identifier stored per row; re-embedding keyed by content hash
- [ ] Deleted source documents remove their chunks

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Exact product name or error code not found | Dense-only retrieval | Add lexical search and fuse |
| Right document, wrong section | Chunks too large, or no reranker | Reduce chunk size; add cross-encoder |
| Answer contradicts the cited passage | Citations not verified | Sample-check faithfulness; enforce numbered citations |
| Users with few documents get empty results | Permission filter applied after top-k | Move the filter into the vector query |
| Quality drops after a corpus sync | Mixed embedding models in the index | Version per row; migrate to a parallel index |
| Long documents dominate every answer | No per-document cap in assembly | Cap chunks per document |
| Model ignores a passage that was retrieved | Passage landed mid-context | Reorder best-first and best-last; shrink the block |
| Retrieval good, answers still wrong | Generation-stage problem | Stop tuning retrieval; fix prompt and output constraints |
| Cited page returns 404 | Chunks not deleted with source | Add deletion propagation to the sync job |

## References

- Reciprocal rank fusion as a score-free ranked-list combination method
- BM25 lexical scoring, and HNSW approximate nearest-neighbor indexing
- Cross-encoder reranking versus bi-encoder retrieval
- Provider documentation for the embedding model in use — verify dimensions and prefixes
- [iterative-retrieval](../iterative-retrieval/SKILL.md),
  [llm-output-validation](../llm-output-validation/SKILL.md),
  [model-evaluation-harness](../model-evaluation-harness/SKILL.md),
  [prompt-injection-defense](../prompt-injection-defense/SKILL.md)
