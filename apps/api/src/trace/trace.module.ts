import { Module } from '@nestjs/common';
import { TraceService } from './trace.service';

/** Trace layer. Exposes the single emit/stream surface (TraceService). */
@Module({
  providers: [TraceService],
  exports: [TraceService],
})
export class TraceModule {}
