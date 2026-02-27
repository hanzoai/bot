---
name: hanzo-search
description: "AI-powered full-text search with Hanzo Search (Meilisearch). Sub-50ms queries, typo tolerance, faceting, filtering, and multi-language support."
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
              "package": "meilisearch",
              "label": "Install Meilisearch Client (pip)",
            },
          ],
      },
  }
---

# Hanzo Search — Full-Text Search

`pip install meilisearch`

Sub-50ms full-text search with typo tolerance, faceted filtering, sorting, and multi-language support. Built on Meilisearch.

## Quick Start

```python
import meilisearch

client = meilisearch.Client("http://localhost:7700", "master-key")

# Create index and add documents
index = client.index("products")
index.add_documents([
    {"id": 1, "title": "Hanzo Agent SDK", "category": "sdk", "price": 0},
    {"id": 2, "title": "Hanzo MCP Server", "category": "tools", "price": 0},
    {"id": 3, "title": "Hanzo Chat Pro", "category": "app", "price": 29},
])

# Search
results = index.search("agent")
for hit in results["hits"]:
    print(hit["title"])
```

## Filtering & Faceting

```python
# Configure filterable attributes
index.update_filterable_attributes(["category", "price"])
index.update_sortable_attributes(["price", "title"])

# Search with filters
results = index.search("hanzo", {
    "filter": "category = sdk AND price < 100",
    "sort": ["price:asc"],
    "limit": 20
})

# Faceted search
results = index.search("hanzo", {
    "facets": ["category"],
})
print(results["facetDistribution"])
# {"category": {"sdk": 5, "tools": 3, "app": 2}}
```

## Typo Tolerance

```python
# Searches for "hanzp" still find "hanzo"
results = index.search("hanzp")
# Returns: Hanzo Agent SDK, Hanzo MCP Server, etc.
```

## Synonyms

```python
index.update_synonyms({
    "ai": ["artificial intelligence", "ml", "machine learning"],
    "sdk": ["library", "package", "client"]
})
```

## Multi-Language

```python
# Chinese, Japanese, Korean, Hebrew, Thai support
index.add_documents([
    {"id": 4, "title": "Hanzo AI", "title_ja": "ハンゾーAI"}
])
```

## Async Client

```python
import meilisearch

# Tasks are async by default
task = index.add_documents(documents)
client.wait_for_task(task.task_uid)
```

## Port

- API: `7700`

## Environment Variables

```bash
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=master-key
```
