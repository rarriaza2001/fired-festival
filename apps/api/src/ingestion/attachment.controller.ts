import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { attachmentUploadSchema } from '@dgb/shared';
import { ok, type ApiResponse } from '../common/api-response';
import { AttachmentStoreService } from './attachment-store.service';
import { PrismaService } from '../persistence/prisma.service';
import {
  inferKindFromFilename,
  KIND_MIME_ALLOWLIST,
} from './link-fetcher.service';

interface UploadAttachmentData {
  readonly id: string;
  readonly kind: string;
  readonly filename: string;
  readonly sizeBytes: number;
}

@Controller('attachments')
export class AttachmentController {
  constructor(
    private readonly attachmentStore: AttachmentStoreService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ApiResponse<UploadAttachmentData>> {
    if (!file) {
      throw new BadRequestException('Missing file upload.');
    }
    if (!this.attachmentStore.isWithinSizeLimit(file.size)) {
      throw new BadRequestException('File exceeds maximum allowed size.');
    }

    const kind = inferKindFromFilename(file.originalname);
    if (!kind) {
      throw new BadRequestException('Unsupported file type.');
    }

    const allowedMimes = KIND_MIME_ALLOWLIST[kind] ?? [];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported MIME type: ${file.mimetype}`);
    }

    const stored = await this.attachmentStore.save(
      file.buffer,
      file.originalname,
      file.mimetype,
      kind,
    );

    await this.prisma.attachment.create({
      data: {
        id: stored.id,
        filename: stored.filename,
        mimeType: stored.mimeType,
        kind: stored.kind,
        sizeBytes: stored.sizeBytes,
        storagePath: stored.storagePath,
        expiresAt: stored.expiresAt,
      },
    });

    const payload = attachmentUploadSchema.parse({
      id: stored.id,
      kind: stored.kind,
      filename: stored.filename,
      sizeBytes: stored.sizeBytes,
    });

    return ok(payload);
  }
}
