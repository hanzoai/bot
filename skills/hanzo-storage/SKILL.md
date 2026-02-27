---
name: hanzo-storage
description: "S3-compatible object storage with Hanzo Storage (MinIO). Upload, download, and manage files, model artifacts, and datasets with erasure coding and encryption."
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
              "package": "minio",
              "label": "Install MinIO Client (pip)",
            },
          ],
      },
  }
---

# Hanzo Storage — Object Storage

`pip install minio`

S3-compatible object storage for files, model artifacts, datasets, and media. Built on MinIO with erasure coding, encryption, and lifecycle management.

## Quick Start

```python
from minio import Minio

client = Minio(
    "localhost:9000",
    access_key="minioadmin",
    secret_key="minioadmin",
    secure=False
)

# Create bucket
if not client.bucket_exists("models"):
    client.make_bucket("models")

# Upload file
client.fput_object("models", "llama3-8b.bin", "/path/to/model.bin")

# Download file
client.fget_object("models", "llama3-8b.bin", "/tmp/model.bin")
```

## Upload Operations

```python
from io import BytesIO

# Upload from bytes
data = BytesIO(b"file content here")
client.put_object("bucket", "path/file.txt", data, length=len(data.getvalue()))

# Upload with metadata
client.fput_object(
    "bucket", "image.png", "/local/image.png",
    content_type="image/png",
    metadata={"x-amz-meta-project": "hanzo-bot"}
)

# Multipart upload (automatic for large files)
client.fput_object("models", "large-model.bin", "/path/to/50gb-model.bin")
```

## Download Operations

```python
# Download to file
client.fget_object("bucket", "file.txt", "/local/file.txt")

# Stream download
response = client.get_object("bucket", "file.txt")
data = response.read()
response.close()
response.release_conn()
```

## List & Search

```python
# List objects
for obj in client.list_objects("bucket", prefix="models/", recursive=True):
    print(f"{obj.object_name} ({obj.size} bytes)")

# List buckets
for bucket in client.list_buckets():
    print(f"{bucket.name} (created: {bucket.creation_date})")
```

## Presigned URLs

```python
from datetime import timedelta

# Download URL (1 hour)
url = client.presigned_get_object("bucket", "file.pdf", expires=timedelta(hours=1))

# Upload URL (1 hour)
url = client.presigned_put_object("bucket", "upload.txt", expires=timedelta(hours=1))
```

## AWS SDK Compatible

```python
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="http://localhost:9000",
    aws_access_key_id="minioadmin",
    aws_secret_access_key="minioadmin"
)

s3.upload_file("/local/file.txt", "bucket", "file.txt")
s3.download_file("bucket", "file.txt", "/local/file.txt")
```

## Ports

- S3 API: `9000`
- Web Console: `9001`

## Environment Variables

```bash
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=default
```
