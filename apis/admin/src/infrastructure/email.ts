import type { Logger } from './logger';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailProvider = {
  readonly name: string;
  send: (message: EmailMessage) => Promise<void>;
};

/** Development provider: logs the message instead of sending it. */
export const createConsoleEmailProvider = (logger: Logger): EmailProvider => ({
  name: 'console',
  async send(message) {
    logger.info(
      { to: message.to, subject: message.subject, body: message.text },
      'email.dispatched (console)'
    );
  }
});

export type EmailProviderConfig = {
  provider: string;
  apiKey?: string;
  from: string;
};

/**
 * Provider factory. Only the console provider ships today; SMTP/Resend can be
 * added as additional implementations without touching calling code.
 */
export const createEmailProvider = (config: EmailProviderConfig, logger: Logger): EmailProvider => {
  switch (config.provider) {
    default:
      return createConsoleEmailProvider(logger);
  }
};
