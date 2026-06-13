import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { EvalJudge } from './eval-judge';
import { EvalHarnessService } from './eval-harness.service';

/**
 * Evaluation feature module.
 *
 * Provides the structural evaluator (via EvalHarnessService) and the
 * LLM-powered judge (EvalJudge). PrismaService is provided globally by
 * PersistenceModule — it is not re-provided here.
 *
 * Import LlmModule so StructuredLlmService is available to EvalJudge.
 */
@Module({
  imports: [LlmModule],
  providers: [EvalJudge, EvalHarnessService],
  exports: [EvalHarnessService],
})
export class EvalModule {}
