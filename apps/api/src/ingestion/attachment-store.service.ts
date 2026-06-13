import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ATTACHMENT_REF_PREFIX,
  CONTEXT_LIMITS,
  type ContextItemKind,
} from '@dgb/shared';
import { loadEnv } from '../config/env';

export interface StoredAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly kind: Exclude<ContextItemKind, 'link'>;
  readonly sizeBytes: number;
  readonly storagePath: string;
  readonly expiresAt: Date;
}

@Injectable()
export class AttachmentStoreService {
  private readonly storageDir: string;
  private readonly ttlHours: number;

  constructor() {
    const env = loadEnv();
    this.storageDir = env.ATTACHMENT_STORAGE_DIR;
    this.ttlHours = env.ATTACHMENT_TTL_HOURS;
  }

  attachmentRef(id: string): string {
    return `${ATTACHMENT_REF_PREFIX}${id}`;
  }

  parseAttachmentId(ref: string): string | null {
    return ref.startsWith(ATTACHMENT_REF_PREFIX)
      ? ref.slice(ATTACHMENT_REF_PREFIX.length)
      : null;
  }

  async save(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    kind: Exclude<ContextItemKind, 'link'>,
  ): Promise<StoredAttachment> {
    await mkdir(this.storageDir, { recursive: true });
    const id = randomUUID();
    const storagePath = join(this.storageDir, id);
    await writeFile(storagePath, buffer);
    const expiresAt = new Date(Date.now() + this.ttlHours * 60 * 60 * 1000);
    return {
      id,
      filename,
      mimeType,
      kind,
      sizeBytes: buffer.byteLength,
      storagePath,
      expiresAt,
    };
  }

  async readById(id: string): Promise<{ buffer: Buffer; meta: StoredAttachment } | null> {
    const storagePath = join(this.storageDir, id);
    try {
      const buffer = await readFile(storagePath);
      return {
        buffer,
        meta: {
          id,
          filename: id,
          mimeType: 'application/octet-stream',
          kind: 'pdf',
          sizeBytes: buffer.byteLength,
          storagePath,
          expiresAt: new Date(Date.now() + this.ttlHours * 60 * 60 * 1000),
        },
      };
    } catch {
      return null;
    }
  }

  isWithinSizeLimit(sizeBytes: number): boolean {
    return sizeBytes <= CONTEXT_LIMITS.MAX_FILE_BYTES;
  }
}
