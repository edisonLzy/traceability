import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface PutObjectOptions {
  contentType?: string;
}

export interface ObjectStorage {
  put(key: string, body: Buffer, options?: PutObjectOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export interface CreateObjectStorageOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** MinIO requires path-style addressing. Defaults to true. */
  forcePathStyle?: boolean;
}

/**
 * Thrown when a caller reads a key that does not exist in the bucket. Distinct
 * from arbitrary transport failures so callers can treat "no such artifact"
 * differently (worker symbolication returns null instead of retrying).
 */
export class ObjectNotFoundError extends Error {
  public constructor(public readonly key: string) {
    super(`object not found: ${key}`);
    this.name = "ObjectNotFoundError";
  }
}

export function createObjectStorage(options: CreateObjectStorageOptions): ObjectStorage {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
    forcePathStyle: options.forcePathStyle ?? true,
  });
  const { bucket } = options;

  return {
    async put(key, body, opts) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: opts?.contentType,
        }),
      );
    },
    async get(key) {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        // Body is a readable stream in Node; collapse to a Buffer here so callers
        // never touch a stream.
        const stream = response.Body as NodeJS.ReadableStream | undefined;
        if (!stream) throw new ObjectNotFoundError(key);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(
            Buffer.isBuffer(chunk)
              ? chunk
              : typeof chunk === "string"
                ? Buffer.from(chunk)
                : Buffer.from(chunk as Uint8Array),
          );
        }
        return Buffer.concat(chunks);
      } catch (error) {
        if (isNoSuchKey(error)) throw new ObjectNotFoundError(key);
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async ping() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
    async close() {
      client.destroy();
    },
  };
}

function isNoSuchKey(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404;
}
