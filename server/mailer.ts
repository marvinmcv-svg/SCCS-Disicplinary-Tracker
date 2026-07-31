import nodemailer, { Transporter } from 'nodemailer';

/**
 * Outbound email.
 *
 * Email is optional: the app runs without SMTP configured. What it must never do
 * is *pretend* to have sent something. The previous notification endpoint logged
 * a line to the console and returned `{ success: true }`, so staff saw a
 * confirmation that a parent had been contacted when no message existed. In a
 * discipline system, where parent contact is a procedural requirement, a false
 * confirmation is worse than no feature at all.
 *
 * So: `isConfigured()` is the gate. Callers must check it and tell the user
 * plainly when email is unavailable, rather than reporting success.
 */

export interface SendResult {
  messageId: string;
  accepted: string[];
}

const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT || '587', 10);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;

/** Address messages are sent from. Falls back to the SMTP username. */
export const fromAddress = process.env.SMTP_FROM || user || '';

let transporter: Transporter | null = null;

/**
 * True when every setting needed to actually deliver mail is present.
 * Check this before offering the user anything that depends on email.
 */
export function isConfigured(): boolean {
  return Boolean(host && user && pass && fromAddress);
}

function getTransporter(): Transporter {
  if (!isConfigured()) {
    throw new Error('SMTP is not configured');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      // Port 465 is implicit TLS; everything else upgrades via STARTTLS.
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<SendResult> {
  const info = await getTransporter().sendMail({ from: fromAddress, ...options });
  return {
    messageId: info.messageId,
    accepted: (info.accepted || []).map(String),
  };
}

/** Verifies the SMTP credentials actually work, for the health check. */
export async function verifyConnection(): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    await getTransporter().verify();
    return true;
  } catch (error: any) {
    console.error('SMTP verification failed:', error.message);
    return false;
  }
}
