import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";

export interface UploadsStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  /** Exact browser origins that may call the API/S3 (defaults shown below). */
  allowedOrigins?: string[];
}

export class UploadsStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: UploadsStackProps) {
    super(scope, id, props);

    // ---- Allowed origins (defaults for your app + localhost) ----
    const allowedOrigins =
      props.allowedOrigins && props.allowedOrigins.length
        ? props.allowedOrigins
        : ["https://app.stylingadventures.com", "http://localhost:3000"];
    const allowedOriginsCsv = allowedOrigins.join(",");

    // ==========================
    // S3 uploads bucket (CORS)
    // ==========================
    this.bucket = new s3.Bucket(this, "UploadsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [
        {
          allowedOrigins,
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedHeaders: [
            "content-type",
            "x-amz-tagging",
            "x-amz-acl",
            "x-amz-security-token",
            "x-amz-user-agent",
            "authorization",
            "x-amz-meta-*",
          ],
          exposedHeaders: ["ETag", "x-amz-request-id", "x-amz-version-id"],
          maxAge: 600,
        },
      ],
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(30),
          tagFilters: { "auto-expire": "true" },
        },
      ],
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const allowCt =
      "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain";
    const maxBytes = "10485760"; // 10 MB

    // Shared Lambda env
    const baseEnv = {
      BUCKET_NAME: this.bucket.bucketName,
      ALLOWED_ORIGINS: allowedOriginsCsv,
    };

    // ============== PUT presigner ==============
    const presignFn = new lambda.Function(this, "PresignFn", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(10),
      environment: { ...baseEnv, ALLOW_CT: allowCt, MAX_BYTES: maxBytes },
      code: lambda.Code.fromInline(`
import os, json, boto3
from uuid import uuid4
s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET_NAME"]
ALLOW_CT = set([x.strip() for x in (os.environ.get("ALLOW_CT") or "").split(",") if x.strip()])
MAX_BYTES = int(os.environ.get("MAX_BYTES") or "10485760")
ALLOWED = set([x.strip() for x in (os.environ.get("ALLOWED_ORIGINS") or "").split(",") if x.strip()])

def _allow_origin(event):
    hdrs = (event or {}).get("headers") or {}
    origin = hdrs.get("origin") or hdrs.get("Origin")
    return origin if origin in ALLOWED else None

def _resp(event, status, body):
    origin = _allow_origin(event)
    h = {"content-type":"application/json"}
    if origin:
        h["Access-Control-Allow-Origin"] = origin
        h["Vary"] = "Origin"
    return {"statusCode": status, "headers": h, "body": json.dumps(body)}

def _sub(event): return (((event or {}).get("requestContext") or {}).get("authorizer") or {}).get("claims", {}).get("sub")

def handler(event, context):
    try:
        sub = _sub(event)
        if not sub: return _resp(event, 401, {"error":"unauthorized"})
        body = json.loads(event.get("body") or "{}")
        filename = (body.get("filename") or "file.bin").replace("/", "_")
        ctype = body.get("contentType") or "application/octet-stream"
        size = int(body.get("size") or 0)
        if ALLOW_CT and ctype not in ALLOW_CT: return _resp(event, 400, {"error": "contentType not allowed"})
        if size and size > MAX_BYTES: return _resp(event, 400, {"error": f"file too large (>{MAX_BYTES} bytes)"})
        key = f"uploads/{sub}/{uuid4()}/{filename}"
        url = s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": BUCKET, "Key": key, "ContentType": ctype, "Tagging": "auto-expire=true"},
            ExpiresIn=3600
        )
        return _resp(event, 200, {"url": url, "key": key})
    except Exception as e:
        return _resp(event, 500, {"error": str(e)})
      `),
    });
    this.bucket.grantPut(presignFn);

    // ============== GET signer ==============
    const signGetFn = new lambda.Function(this, "SignGetFn", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(10),
      environment: baseEnv,
      code: lambda.Code.fromInline(`
import os, json, boto3, urllib.parse
s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET_NAME"]
ALLOWED = set([x.strip() for x in (os.environ.get("ALLOWED_ORIGINS") or "").split(",") if x.strip()])

def _allow_origin(event):
    hdrs = (event or {}).get("headers") or {}
    origin = hdrs.get("origin") or hdrs.get("Origin")
    return origin if origin in ALLOWED else None

def _resp(event, status, body):
    origin = _allow_origin(event)
    h = {"content-type":"application/json"}
    if origin:
        h["Access-Control-Allow-Origin"] = origin
        h["Vary"] = "Origin"
    return {"statusCode": status, "headers": h, "body": json.dumps(body)}

def _sub(event): return (((event or {}).get("requestContext") or {}).get("authorizer") or {}).get("claims", {}).get("sub")

def handler(event, context):
    try:
        sub = _sub(event)
        if not sub: return _resp(event, 401, {"error":"unauthorized"})
        qs = event.get("queryStringParameters") or {}
        key = qs.get("key")
        if not key: return _resp(event, 400, {"error": "key query param required"})
        key = urllib.parse.unquote(key)
        user_prefix = f"uploads/{sub}/"
        if not key.startswith(user_prefix): return _resp(event, 403, {"error": "not your key"})
        download = (qs.get("download") or "false").lower() == "true"
        params = {"Bucket": BUCKET, "Key": key, "ResponseContentDisposition": "attachment" if download else "inline"}
        url = s3.generate_presigned_url("get_object", Params=params, ExpiresIn=300)
        return _resp(event, 200, {"url": url})
    except Exception as e:
        return _resp(event, 500, {"error": str(e)})
      `),
    });
    this.bucket.grantRead(signGetFn);

    // ============== LIST ==============
    const listFn = new lambda.Function(this, "ListFn", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(10),
      environment: baseEnv,
      code: lambda.Code.fromInline(`
import os, json, boto3, urllib.parse, datetime
from datetime import timezone
s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET_NAME"]
ALLOWED = set([x.strip() for x in (os.environ.get("ALLOWED_ORIGINS") or "").split(",") if x.strip()])

def _allow_origin(event):
    hdrs = (event or {}).get("headers") or {}
    origin = hdrs.get("origin") or hdrs.get("Origin")
    return origin if origin in ALLOWED else None

def _resp(event, status, body):
    origin = _allow_origin(event)
    h = {"content-type":"application/json"}
    if origin:
        h["Access-Control-Allow-Origin"] = origin
        h["Vary"] = "Origin"
    return {"statusCode": status, "headers": h, "body": json.dumps(body, default=str)}

def _sub(event): return (((event or {}).get("requestContext") or {}).get("authorizer") or {}).get("claims", {}).get("sub")

def handler(event, context):
    try:
        sub = _sub(event)
        if not sub: return _resp(event, 401, {"error":"unauthorized"})
        qs = event.get("queryStringParameters") or {}
        limit = int(qs.get("limit") or 50)
        limit = 1 if limit < 1 else 1000 if limit > 1000 else limit
        prefix = qs.get("prefix") or f"uploads/{sub}/"
        prefix = urllib.parse.unquote(prefix)
        if not prefix.startswith(f"uploads/{sub}/"): return _resp(event, 403, {"error":"prefix must start with your uploads/ sub"})
        resp = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix, MaxKeys=limit)
        items = [{"key": o["Key"], "size": o["Size"], "lastModified": o["LastModified"].astimezone(timezone.utc).isoformat()} for o in resp.get("Contents", [])]
        return _resp(event, 200, {"items": items})
    except Exception as e:
        return _resp(event, 500, {"error": str(e)})
      `),
    });
    this.bucket.grantRead(listFn);

    // ============== DELETE ==============
    const deleteFn = new lambda.Function(this, "DeleteFn", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(10),
      environment: baseEnv,
      code: lambda.Code.fromInline(`
import os, json, boto3, urllib.parse
s3 = boto3.client("s3")
BUCKET = os.environ["BUCKET_NAME"]
ALLOWED = set([x.strip() for x in (os.environ.get("ALLOWED_ORIGINS") or "").split(",") if x.strip()])

def _allow_origin(event):
    hdrs = (event or {}).get("headers") or {}
    origin = hdrs.get("origin") or hdrs.get("Origin")
    return origin if origin in ALLOWED else None

def _resp(event, status, body):
    origin = _allow_origin(event)
    h = {"content-type":"application/json"}
    if origin:
        h["Access-Control-Allow-Origin"] = origin
        h["Vary"] = "Origin"
    return {"statusCode": status, "headers": h, "body": json.dumps(body)}

def _sub(event): return (((event or {}).get("requestContext") or {}).get("authorizer") or {}).get("claims", {}).get("sub")

def handler(event, context):
    try:
        sub = _sub(event)
        if not sub: return _resp(event, 401, {"error":"unauthorized"})
        qs = event.get("queryStringParameters") or {}
        key = qs.get("key")
        if not key and event.get("body"):
            try: key = json.loads(event["body"]).get("key")
            except Exception: pass
        if not key: return _resp(event, 400, {"error":"key required"})
        key = urllib.parse.unquote(key)
        if not key.startswith(f"uploads/{sub}/"): return _resp(event, 403, {"error":"not your key"})
        s3.delete_object(Bucket=BUCKET, Key=key)
        return _resp(event, 200, {"deleted": key})
    except Exception as e:
        return _resp(event, 500, {"error": str(e)})
      `),
    });
    this.bucket.grantDelete(deleteFn);

    // ==========================
    // API Gateway (CORS + Auth)
    // ==========================
    this.api = new apigateway.RestApi(this, "UploadsApi", {
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins,
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });

    // Ensure even Gateway-generated 4XX/5XX include CORS so the browser can see the message
    new apigateway.GatewayResponse(this, "Default4xx", {
      restApi: this.api,
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'*'",
        "Access-Control-Allow-Methods": "'GET,POST,DELETE,OPTIONS'",
      },
    });
    new apigateway.GatewayResponse(this, "Default5xx", {
      restApi: this.api,
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'*'",
        "Access-Control-Allow-Methods": "'GET,POST,DELETE,OPTIONS'",
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "UploadsAuthorizer", {
      cognitoUserPools: [props.userPool],
    });

    const withAuth = (fn: lambda.Function) => ({
      integration: new apigateway.LambdaIntegration(fn),
      opts: { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO },
    });

    this.api.root.addResource("presign")
      .addMethod("POST", withAuth(presignFn).integration, withAuth(presignFn).opts);

    this.api.root.addResource("sign-url")
      .addMethod("GET", withAuth(signGetFn).integration, withAuth(signGetFn).opts);

    this.api.root.addResource("list")
      .addMethod("GET", withAuth(listFn).integration, withAuth(listFn).opts);

    const del = this.api.root.addResource("delete");
    del.addMethod("DELETE", withAuth(deleteFn).integration, withAuth(deleteFn).opts);
    del.addMethod("POST", withAuth(deleteFn).integration, withAuth(deleteFn).opts);

    new cdk.CfnOutput(this, "UploadsApiUrl", { value: this.api.url });
    new cdk.CfnOutput(this, "UploadsBucketName", { value: this.bucket.bucketName });
  }
}
