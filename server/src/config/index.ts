import { z } from "zod";

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://traceability:traceability@127.0.0.1:5432/traceability"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
  PUBLIC_INGEST_URL: z.string().url().default("http://127.0.0.1:3000"),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  INGEST_MAX_COMPRESSED_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(50 * 1024 * 1024)
    .default(1_048_576),
  INGEST_MAX_DECOMPRESSED_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(100 * 1024 * 1024)
    .default(5_242_880),
  INGEST_MAX_ITEMS: z.coerce.number().int().min(1).max(100).default(20),
  INGEST_MAX_ITEM_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(50 * 1024 * 1024)
    .default(1_048_576),
  CORS_ORIGINS: z.string().default(""),
  TRUST_PROXY: z.coerce.boolean().default(false),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  OBJECT_STORAGE_ENDPOINT: z.string().url().default("http://127.0.0.1:9000"),
  OBJECT_STORAGE_REGION: z.string().min(1).default("us-east-1"),
  OBJECT_STORAGE_BUCKET: z.string().min(1).default("traceability-sourcemaps"),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1).default("traceability"),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1).default("traceability-development-secret"),
  SOURCEMAP_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(200 * 1024 * 1024)
    .default(20_971_520),
  REPLAY_MAX_RECORDING_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(100 * 1024 * 1024)
    .default(10_485_760),
});

export interface RuntimeConfig {
  environment: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  databasePoolMax: number;
  redisUrl: string;
  publicIngestUrl: string;
  jwtSecret: string;
  jwtAccessTokenTtlSeconds: number;
  ingestMaxCompressedBytes: number;
  ingestMaxDecompressedBytes: number;
  ingestMaxItems: number;
  ingestMaxItemBytes: number;
  corsOrigins: string[];
  trustProxy: boolean;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
  objectStorageEndpoint: string;
  objectStorageRegion: string;
  objectStorageBucket: string;
  objectStorageAccessKey: string;
  objectStorageSecretKey: string;
  sourcemapMaxBytes: number;
  replayMaxRecordingBytes: number;
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const parsed = EnvironmentSchema.parse(environment);
  if (parsed.NODE_ENV === "production" && !parsed.JWT_SECRET) {
    throw new Error("JWT_SECRET is required in production");
  }

  return {
    environment: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    redisUrl: parsed.REDIS_URL,
    publicIngestUrl: parsed.PUBLIC_INGEST_URL,
    jwtSecret: parsed.JWT_SECRET ?? "traceability-development-jwt-secret-change-me",
    jwtAccessTokenTtlSeconds: parsed.JWT_ACCESS_TOKEN_TTL_SECONDS,
    ingestMaxCompressedBytes: parsed.INGEST_MAX_COMPRESSED_BYTES,
    ingestMaxDecompressedBytes: parsed.INGEST_MAX_DECOMPRESSED_BYTES,
    ingestMaxItems: parsed.INGEST_MAX_ITEMS,
    ingestMaxItemBytes: parsed.INGEST_MAX_ITEM_BYTES,
    corsOrigins: parsed.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: parsed.TRUST_PROXY,
    logLevel: parsed.LOG_LEVEL,
    objectStorageEndpoint: parsed.OBJECT_STORAGE_ENDPOINT,
    objectStorageRegion: parsed.OBJECT_STORAGE_REGION,
    objectStorageBucket: parsed.OBJECT_STORAGE_BUCKET,
    objectStorageAccessKey: parsed.OBJECT_STORAGE_ACCESS_KEY,
    objectStorageSecretKey: parsed.OBJECT_STORAGE_SECRET_KEY,
    sourcemapMaxBytes: parsed.SOURCEMAP_MAX_BYTES,
    replayMaxRecordingBytes: parsed.REPLAY_MAX_RECORDING_BYTES,
  };
}
