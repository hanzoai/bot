---
name: hanzo-api
description: "Use the Hanzo AI API (LLM Gateway) to call 100+ LLM providers with a unified OpenAI-compatible interface. Chat completions, embeddings, images, audio, fine-tuning, and more via the hanzoai Python SDK."
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
              "package": "hanzoai",
              "label": "Install Hanzo AI SDK (pip)",
            },
          ],
      },
  }
---

# Hanzo API — Unified LLM Gateway

`pip install hanzoai`

OpenAI-compatible interface to 100+ LLM providers.

## Quick Start

```python
from hanzoai import Hanzo

client = Hanzo(api_key="your-api-key")

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

## Environment Variables

```bash
HANZO_API_KEY=sk-...                       # API key (required)
HANZO_BASE_URL=https://api.hanzo.ai        # API base URL
```

## Chat Completions

```python
# Standard completion
response = client.chat.completions.create(
    model="claude-sonnet-4-20250514",
    messages=[
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Explain quantum computing"}
    ],
    temperature=0.7,
    max_tokens=1000
)

# Streaming
for chunk in client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True
):
    print(chunk.choices[0].delta.content or "", end="")
```

## Async Client

```python
from hanzoai import AsyncHanzo

client = AsyncHanzo(api_key="...")

response = await client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}]
)
```

## Embeddings

```python
response = client.embeddings.create(
    model="text-embedding-3-small",
    input="The food was delicious"
)
vector = response.data[0].embedding
```

## Image Generation

```python
response = client.images.generate(
    model="dall-e-3",
    prompt="A sunset over mountains",
    size="1024x1024"
)
image_url = response.data[0].url
```

## Audio

```python
# Text-to-Speech
audio = client.audio.speech.create(
    model="tts-1",
    input="Hello world",
    voice="alloy"
)
audio.stream_to_file("output.mp3")

# Speech-to-Text
transcript = client.audio.transcriptions.create(
    model="whisper-1",
    file=open("audio.mp3", "rb")
)
```

## Models

```python
# List available models
models = client.models.list()
for m in models.data:
    print(m.id)
```

## Provider-Specific Access

```python
# Anthropic Claude
client.chat.completions.create(model="claude-sonnet-4-20250514", ...)

# Google Gemini
client.chat.completions.create(model="gemini/gemini-2.0-flash", ...)

# AWS Bedrock
client.chat.completions.create(model="bedrock/anthropic.claude-3-sonnet", ...)

# Azure OpenAI
client.chat.completions.create(model="azure/gpt-4", ...)

# Together AI
client.chat.completions.create(model="together_ai/meta-llama/Llama-3-70b", ...)

# Ollama (local)
client.chat.completions.create(model="ollama/llama3", ...)
```

## Team & Organization Management

```python
# Teams
teams = client.team.list()
client.team.create(team_alias="engineering")

# Organizations
orgs = client.organization.list()

# API Key management
keys = client.key.list()
client.key.generate(team_id="...")
```

## Cost Tracking

```python
# Get spend data
spend = client.global_spend.retrieve()

# Per-team spend
team_spend = client.global_spend.list_spend_logs(api_key="...")
```

## Supported Providers

OpenAI, Anthropic, Google Gemini, AWS Bedrock, Azure OpenAI, Together AI, Cohere, Mistral, Groq, DeepSeek, Ollama, VLLM, HuggingFace, Replicate, Perplexity, Fireworks AI, Anyscale, and 80+ more.
