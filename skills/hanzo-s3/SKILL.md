---
name: hanzo-s3
description: "Manage object storage with Hanzo S3. Upload, download, list, and manage files in S3-compatible buckets via the hanzo-s3 Python SDK (MinIO-compatible)."
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
              "package": "hanzo-s3",
              "label": "Install Hanzo S3 SDK (pip)",
            },
          ],
      },
  }
---

# Hanzo S3 — Object Storage

`pip install hanzo-s3`

Thin wrapper around MinIO Python client with Hanzo branding. Fully S3-compatible.

## Quick Start

```python
from hanzo_s3 import S3Client

client = S3Client(
    "s3.hanzo.space",
    access_key="your-access-key",
    secret_key="your-secret-key"
)
```

## Bucket Operations

```python
# List all buckets
buckets = client.list_buckets()
for b in buckets:
    print(b.name, b.creation_date)

# Create bucket
client.make_bucket("my-bucket")

# Check if bucket exists
exists = client.bucket_exists("my-bucket")

# Remove bucket (must be empty)
client.remove_bucket("my-bucket")
```

## Upload Files

```python
# Upload from local file
client.fput_object("my-bucket", "remote/path.txt", "/local/path.txt")

# Upload from bytes/stream
from io import BytesIO
data = BytesIO(b"file content here")
client.put_object("my-bucket", "remote/path.txt", data, length=len(data.getvalue()))

# Upload with metadata
client.fput_object(
    "my-bucket", "image.png", "/local/image.png",
    content_type="image/png",
    metadata={"x-amz-meta-author": "hanzo"}
)
```

## Download Files

```python
# Download to local file
client.fget_object("my-bucket", "remote/path.txt", "/local/download.txt")

# Download as stream
response = client.get_object("my-bucket", "remote/path.txt")
data = response.read()
response.close()
response.release_conn()
```

## List Objects

```python
# List objects in bucket
objects = client.list_objects("my-bucket", prefix="data/", recursive=True)
for obj in objects:
    print(obj.object_name, obj.size, obj.last_modified)
```

## Delete Objects

```python
# Delete single object
client.remove_object("my-bucket", "remote/path.txt")

# Delete multiple objects
from hanzo_s3 import DeleteObject
objects = [DeleteObject("file1.txt"), DeleteObject("file2.txt")]
errors = client.remove_objects("my-bucket", objects)
for err in errors:
    print(f"Error deleting {err.name}: {err.message}")
```

## Presigned URLs

```python
from datetime import timedelta

# Generate presigned download URL (valid 1 hour)
url = client.presigned_get_object("my-bucket", "file.pdf", expires=timedelta(hours=1))

# Generate presigned upload URL
url = client.presigned_put_object("my-bucket", "upload.txt", expires=timedelta(hours=1))
```

## Admin Operations

```python
from hanzo_s3 import S3Admin

admin = S3Admin(
    "s3.hanzo.space",
    credentials=("admin-key", "admin-secret")
)

# Get server info
info = admin.info()
```

## Class Aliases

| Hanzo                 | MinIO            |
| --------------------- | ---------------- |
| `S3Client` / `Client` | `Minio`          |
| `S3Admin` / `Admin`   | `MinioAdmin`     |
| `S3Error`             | `S3Error`        |
| `S3Exception`         | `MinioException` |

All MinIO Python client methods are available. See [MinIO Python docs](https://min.io/docs/minio/linux/developers/python/API.html).
