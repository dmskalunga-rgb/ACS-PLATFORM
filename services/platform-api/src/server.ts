import { buildApp } from './app.js';
import { loadConfiguration } from './config.js';
import { startTelemetry } from '@acs/observability';

const configuration = loadConfiguration();
const telemetry = startTelemetry({
  ...(configuration.otlpEndpoint === undefined ? {} : { endpoint: configuration.otlpEndpoint }),
  serviceName: 'acs-platform-api',
  serviceVersion: '0.0.0-foundation',
});
const app = await buildApp(configuration);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down FOUNDATION service');
  await app.close();
  await telemetry.shutdown();
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: configuration.host, port: configuration.port });
