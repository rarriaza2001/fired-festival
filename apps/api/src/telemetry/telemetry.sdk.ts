import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  PeriodicExportingMetricReader,
  type IMetricReader,
} from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

/** Telemetry-relevant slice of the validated app env. */
export interface TelemetryEnv {
  readonly OTEL_ENABLED: boolean;
  readonly OTEL_PROMETHEUS_PORT: number;
  readonly OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  readonly OTEL_SERVICE_NAME: string;
}

let sdk: NodeSDK | null = null;

/**
 * Start the OpenTelemetry NodeSDK once, before Nest boots. No-op when telemetry
 * is disabled. Bridge-only: NO auto-instrumentation is registered — spans and
 * metrics come solely from the phase8.v1 → OTel bridge in TelemetryService.
 *
 * Metrics are always exposed on a Prometheus scrape endpoint
 * (`GET :<port>/metrics`). Traces go to an OTLP collector when an endpoint is
 * configured, otherwise to the console. When an OTLP endpoint is set, metrics
 * are also pushed there in addition to Prometheus.
 */
export async function startTelemetry(env: TelemetryEnv): Promise<void> {
  if (!env.OTEL_ENABLED || sdk) return;

  const hasOtlp = Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT);

  const spanProcessor: SpanProcessor = hasOtlp
    ? new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
        }),
      )
    : new SimpleSpanProcessor(new ConsoleSpanExporter());

  const metricReaders: IMetricReader[] = [
    new PrometheusExporter({ port: env.OTEL_PROMETHEUS_PORT }),
  ];
  if (hasOtlp) {
    metricReaders.push(
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
        }),
      }),
    );
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
    }),
    spanProcessors: [spanProcessor],
    metricReaders,
  });

  sdk.start();
}

/** Flush + shut down the SDK on app teardown. Safe to call when never started. */
export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } finally {
    sdk = null;
  }
}
