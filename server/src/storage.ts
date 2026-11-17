import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

// Object-storage seam. LocalFileStorage was the original "local stand-in"
// (no real hosting/bucket existed yet); R2Storage below is the real
// production implementation, added once real hosting exists. Both satisfy
// the exact same interface, so index.ts picks one and nothing in
// routes/auth above this layer changes regardless of which is active.
export interface BackupStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
}

export class LocalFileStorage implements BackupStorage {
  constructor(private readonly rootDir: string) {
    if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
  }

  private resolve(key: string): string {
    // Keys are always server-generated (hospitalId/filename, both already
    // validated upstream), never taken raw from a client-supplied path —
    // this normalize+contains check is defense in depth, not the only guard.
    const full = path.normalize(path.join(this.rootDir, key));
    if (!full.startsWith(path.normalize(this.rootDir))) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    // Write-then-rename, matching the same atomicity principle the
    // Electron app's own local backup already uses — a reader can never
    // observe a partially-written file under the final name.
    const tmp = `${full}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, full);
  }

  async get(key: string): Promise<Buffer | null> {
    const full = this.resolve(key);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full);
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.resolve(key));
  }
}

// Real production storage — Cloudflare R2, via its S3-compatible API.
// Credentials never leave this process: they're read from environment
// variables in index.ts and passed in here at construction, the same way
// DEVICE_SETUP_TOKEN already is — nothing about how routes/backup.ts calls
// BackupStorage changes, so this is a drop-in replacement for
// LocalFileStorage, not a parallel code path.
export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class R2Storage implements BackupStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: "application/octet-stream",
      })
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (error) {
      // The S3 API's own "not found" signal — every other error (auth,
      // network, bucket misconfigured) should still surface as a real
      // failure to the caller, not be silently swallowed into a 404.
      if (error instanceof Error && error.name === "NoSuchKey") return null;
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) return false;
      throw error;
    }
  }
}
