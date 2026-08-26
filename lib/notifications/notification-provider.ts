export interface RecoveryEmailInput {
  recoveryCaseId: string;
  customer: { name: string; email: string };
  amountPaise: number;
  paymentLinkUrl?: string;
}

export interface NotificationDelivery {
  id: string;
  status: 'simulated' | 'sent';
  simulated: boolean;
}

export interface NotificationProvider {
  readonly kind: 'mock' | 'real-email';
  sendRecoveryEmail(input: RecoveryEmailInput): Promise<NotificationDelivery>;
}

export abstract class RealEmailNotificationProvider
  implements NotificationProvider
{
  readonly kind = 'real-email' as const;
  abstract sendRecoveryEmail(
    input: RecoveryEmailInput,
  ): Promise<NotificationDelivery>;
}

export class MockNotificationProvider implements NotificationProvider {
  readonly kind = 'mock' as const;

  async sendRecoveryEmail(input: RecoveryEmailInput) {
    return {
      id: `email_demo_${input.recoveryCaseId}`,
      status: 'simulated' as const,
      simulated: true,
    };
  }
}

export function resolveNotificationProvider(): NotificationProvider {
  return new MockNotificationProvider();
}
