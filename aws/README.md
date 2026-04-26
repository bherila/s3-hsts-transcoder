# aws — AWS Lambda entrypoint

Lambda container image. Triggered by an EventBridge cron rule.

See **[../PLAN.md](../PLAN.md)** for architecture and **[../CLAUDE.md](../CLAUDE.md)** for conventions.

## Configuration

Set the env vars listed in [`local/.env.sample`](../local/.env.sample) on the Lambda function (`Configuration → Environment variables` in the AWS console). Use AWS Secrets Manager / KMS for `*_SECRET_ACCESS_KEY` if treating them as secrets. On this entrypoint, `MAX_RUNTIME_SECONDS` defaults to **900** (Lambda's hard cap).

## Memory / timeout

- Memory: **3008–10240 MB**. More memory ≈ proportionally more vCPU; for transcoding, set high.
- Timeout: **900s** (Lambda max). The transcoder self-imposes a 75% runtime budget (default 675s) and exits cleanly before the platform kill.

## Build

From the repo root:

```sh
docker build -f aws/Dockerfile -t s3-hsts-transcoder-aws .
```

Multi-arch (Graviton ARM64 is cheaper):

```sh
docker buildx build -f aws/Dockerfile \
    --platform linux/amd64,linux/arm64 \
    -t <account>.dkr.ecr.<region>.amazonaws.com/s3-hsts-transcoder-aws:latest \
    --push .
```

## Deploy

1. Create an ECR repository and push the image (above).
2. Create the Lambda function from the container image.
3. Attach an IAM role using the [Sample IAM policy](#sample-iam-policy) below.
4. Set environment variables (see Configuration).
5. Create an EventBridge rule with a cron expression (e.g., `cron(0/15 * * * ? *)`) targeting the function.

## Local test (optional)

The Lambda Runtime Interface Emulator runs the image locally:

```sh
docker run --rm -p 9000:8080 \
    --env-file ../local/.env \
    s3-hsts-transcoder-aws

# In another shell:
curl -X POST 'http://localhost:9000/2015-03-31/functions/function/invocations' -d '{}'
```

## Sample IAM policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket", "s3:HeadObject"],
      "Resource": ["arn:aws:s3:::SOURCE_BUCKET", "arn:aws:s3:::SOURCE_BUCKET/*"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:HeadObject"
      ],
      "Resource": ["arn:aws:s3:::DEST_BUCKET", "arn:aws:s3:::DEST_BUCKET/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```
