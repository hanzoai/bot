# Bot Amazon Bedrock Provider

Official Bot provider plugin for Amazon Bedrock. It adds Bedrock model discovery, text generation, embeddings, and guardrail-aware provider routing for agents that use AWS-hosted models.

Install from Bot:

```bash
bot plugins install @hanzo/bot-amazon-bedrock-provider
```

Configure AWS credentials and region through your normal Bot credential/profile setup, then select Bedrock models with the `amazon-bedrock/...` provider prefix.
