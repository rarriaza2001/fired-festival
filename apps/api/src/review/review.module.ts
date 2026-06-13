import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { TraceModule } from '../trace/trace.module';
import { ToolsModule } from '../tools/tools.module';
import { EvalModule } from '../eval/eval.module';
import { MetricsModule } from '../metrics/metrics.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { ReviewController } from './review.controller';
import { ReviewOrchestrator } from './review-orchestrator.service';
import { AgentRunner } from '../agent/agent-runner.service';
import { AlarmService } from '../alarms/alarm.service';

/**
 * Review feature module — the workflow spine, its SSE stream, and result/replay
 * endpoints. PrismaService is provided globally (PersistenceModule). Phase D
 * gates: ToolsModule (external-check pass), EvalModule (per-run evaluation),
 * MetricsModule (per-run rollup).
 */
@Module({
  imports: [LlmModule, TraceModule, ToolsModule, EvalModule, MetricsModule, IngestionModule],
  controllers: [ReviewController],
  providers: [ReviewOrchestrator, AgentRunner, AlarmService],
})
export class ReviewModule {}
