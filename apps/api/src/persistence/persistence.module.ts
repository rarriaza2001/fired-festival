import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global persistence layer. Exposes the shared PrismaService. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PersistenceModule {}
