import type { AuthorizationPort } from '@acs/foundation';
import {
  noOpEventTelemetry,
  type EventDeliveryTelemetryPort,
  type ReplayRepositoryPort,
} from './types.js';

export class ReplayDeniedError extends Error {
  constructor(readonly reason: string) {
    super('Event replay is not authorized.');
    this.name = 'ReplayDeniedError';
  }
}

export class ControlledReplayService {
  constructor(
    private readonly authorization: AuthorizationPort,
    private readonly repository: ReplayRepositoryPort,
    private readonly telemetry: EventDeliveryTelemetryPort = noOpEventTelemetry,
  ) {}

  async request(input: {
    readonly actorId: string;
    readonly assuranceSatisfied: boolean;
    readonly correlationId: string;
    readonly eventId: string;
    readonly reason: string;
    readonly tenantId: string;
  }): Promise<void> {
    if (!input.assuranceSatisfied) {
      this.telemetry.replay('denied');
      throw new ReplayDeniedError('STEP_UP_REQUIRED');
    }
    const decision = await this.authorization.authorize({
      action: 'platform.events.replay',
      attributes: { assurance_satisfied: true },
      resource: `platform:event:${input.eventId}`,
      subject_id: input.actorId,
      tenant_id: input.tenantId,
    });
    if (!decision.allowed) {
      this.telemetry.replay('denied');
      throw new ReplayDeniedError(decision.reason);
    }
    const reason = input.reason.trim();
    if (reason.length < 10 || reason.length > 500) {
      this.telemetry.replay('denied');
      throw new ReplayDeniedError('INVALID_REASON');
    }
    await this.repository.requestReplay({ ...input, reason });
    this.telemetry.replay('allowed');
  }
}
