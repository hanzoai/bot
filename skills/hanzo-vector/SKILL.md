---
name: hanzo-vector
description: "Vector similarity search with Hanzo Vector (Qdrant). Store embeddings, semantic search, hybrid search, RAG pipelines, and recommendation systems."
metadata:
  {
    "bot":
      {
        "requires": { "bins": ["python3"] },
        "install":
          [
            {
              "id": "pip",
              "kind": "pip",
              "package": "qdrant-client",
              "label": "Install Qdrant Client (pip)",
            },
          ],
      },
  }
---

# Hanzo Vector — Similarity Search Engine

`pip install qdrant-client`

Vector similarity search for embeddings, semantic search, RAG pipelines, and recommendations. Built on Qdrant.

## Quick Start

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

client = QdrantClient("http://localhost:6333")

# Create collection
client.create_collection(
    collection_name="documents",
    vectors_config=VectorParams(size=384, distance=Distance.COSINE)
)

# Upsert vectors
client.upsert(
    collection_name="documents",
    points=[
        PointStruct(id=1, vector=[0.1, 0.2, ...], payload={"text": "Hello world"}),
        PointStruct(id=2, vector=[0.3, 0.4, ...], payload={"text": "Goodbye world"}),
    ]
)

# Search
results = client.search(
    collection_name="documents",
    query_vector=[0.1, 0.2, ...],
    limit=10
)
for r in results:
    print(r.payload["text"], r.score)
```

## Hybrid Search (Dense + Sparse)

```python
from qdrant_client.models import SparseVector, SearchRequest

# Search with both dense and sparse vectors
results = client.search(
    collection_name="documents",
    query_vector=dense_vector,
    query_filter={"must": [{"key": "category", "match": {"value": "tech"}}]},
    limit=10
)
```

## Payload Filtering

```python
from qdrant_client.models import Filter, FieldCondition, MatchValue, Range

# Complex filtering
results = client.search(
    collection_name="documents",
    query_vector=embedding,
    query_filter=Filter(
        must=[
            FieldCondition(key="author", match=MatchValue(value="hanzo")),
            FieldCondition(key="year", range=Range(gte=2024)),
        ]
    ),
    limit=10
)
```

## RAG Pipeline

```python
# 1. Generate embedding for query
from hanzoai import Hanzo
ai = Hanzo(api_key="...")
embedding = ai.embeddings.create(
    model="text-embedding-3-small",
    input="What is Hanzo MCP?"
).data[0].embedding

# 2. Search vector DB
results = client.search(
    collection_name="knowledge",
    query_vector=embedding,
    limit=5
)

# 3. Build context for LLM
context = "\n".join([r.payload["text"] for r in results])
```

## In-Memory (Testing)

```python
client = QdrantClient(":memory:")  # No server needed
```

## Ports

- HTTP REST: `6333`
- gRPC: `6334`

## Environment Variables

```bash
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_API_KEY=...          # Optional, requires TLS
```
