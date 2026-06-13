import { Controller, Get } from '@nestjs/common';
import { ProviderRegistry } from '../providers/provider.registry';
import { ok, type ApiResponse } from '../common/api-response';

interface HealthStatus {
  status: 'ok';
  providers: ReadonlyArray<string>;
}

@Controller('health')
export class HealthController {
  constructor(private readonly providers: ProviderRegistry) {}

  @Get()
  check(): ApiResponse<HealthStatus> {
    return ok({ status: 'ok', providers: this.providers.supported() });
  }
}
