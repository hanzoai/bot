---
name: hanzo-paas
description: "Deploy and manage applications on Hanzo PaaS (platform.hanzo.ai). Manage projects, environments, deployments, domains, and logs via the Hanzo Platform API."
metadata: { "bot": { "requires": { "bins": ["curl"] } } }
---

# Hanzo PaaS — Platform as a Service

Hanzo PaaS (Dokploy-based) at `platform.hanzo.ai` provides application hosting, deployments, and infrastructure management.

## Authentication

```bash
# Get auth token via IAM
export HANZO_IAM_ENDPOINT=https://iam.hanzo.ai
export HANZO_PLATFORM_URL=https://platform.hanzo.ai

# Or use API token directly
export HANZO_PLATFORM_TOKEN=your-api-token
```

## API Base

```
https://platform.hanzo.ai/api
```

All requests require `Authorization: Bearer <token>` header.

## Project Management

```bash
# List projects
curl -s -H "Authorization: Bearer $TOKEN" \
  "$PLATFORM_URL/api/project.all" | jq

# Create project
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app", "description": "My application"}' \
  "$PLATFORM_URL/api/project.create" | jq

# Get project details
curl -s -H "Authorization: Bearer $TOKEN" \
  "$PLATFORM_URL/api/project.one?projectId=<id>" | jq
```

## Application Deployments

```bash
# Create application service
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "<project-id>",
    "name": "my-service",
    "appName": "my-service",
    "dockerImage": "ghcr.io/hanzoai/my-app:latest"
  }' "$PLATFORM_URL/api/application.create" | jq

# Deploy (trigger rebuild)
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"applicationId": "<app-id>"}' \
  "$PLATFORM_URL/api/application.deploy" | jq

# Get deployment logs
curl -s -H "Authorization: Bearer $TOKEN" \
  "$PLATFORM_URL/api/application.readLogs?applicationId=<id>" | jq
```

## Docker Compose Deployments

```bash
# Create compose service
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "<project-id>",
    "name": "my-stack",
    "composeFile": "version: '\''3.8'\''\nservices:\n  web:\n    image: nginx"
  }' "$PLATFORM_URL/api/compose.create" | jq

# Deploy compose
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"composeId": "<compose-id>"}' \
  "$PLATFORM_URL/api/compose.deploy" | jq
```

## Domain Management

```bash
# Add domain to application
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "applicationId": "<app-id>",
    "host": "myapp.hanzo.ai",
    "certificateType": "letsencrypt"
  }' "$PLATFORM_URL/api/domain.create" | jq
```

## Environment Variables

```bash
# Set env var on application
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "applicationId": "<app-id>",
    "env": "DATABASE_URL=postgresql://..."
  }' "$PLATFORM_URL/api/application.saveEnvironment" | jq
```

## Python SDK (via MCP tools)

The `hanzo-tools-paas` package provides MCP tools for PaaS:

```python
# Available via hanzo-mcp server
# Tools: paas_list_projects, paas_deploy, paas_logs, paas_env
```

## K8s Direct Access (for admins)

```bash
# Cluster: do-sfo3-hanzo-k8s (24.199.76.156)
kubectl get pods -A
kubectl rollout restart deployment/<name> -n <namespace>
kubectl logs deployment/<name> -n <namespace> --tail=100
```

## Key Endpoints

| Endpoint                      | Purpose                |
| ----------------------------- | ---------------------- |
| `project.all`                 | List all projects      |
| `project.create`              | Create project         |
| `application.create`          | Create app service     |
| `application.deploy`          | Trigger deployment     |
| `application.readLogs`        | Read app logs          |
| `compose.create`              | Create compose service |
| `compose.deploy`              | Deploy compose         |
| `domain.create`               | Add domain             |
| `application.saveEnvironment` | Set env vars           |
