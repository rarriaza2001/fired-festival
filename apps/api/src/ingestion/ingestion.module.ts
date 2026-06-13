import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { AttachmentController } from './attachment.controller';
import { AttachmentStoreService } from './attachment-store.service';
import { ContextIngestionService } from './context-ingestion.service';

@Module({
  imports: [PersistenceModule],
  controllers: [AttachmentController],
  providers: [AttachmentStoreService, ContextIngestionService],
  exports: [AttachmentStoreService, ContextIngestionService],
})
export class IngestionModule {}
