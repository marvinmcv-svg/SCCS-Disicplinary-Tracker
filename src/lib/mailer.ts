// Outgoing email for server-side notifications (e.g. new disciplinary
// referrals to coordinators). Configure ONE of these on the server:
//
//   Resend:  RESEND_API_KEY, MAIL_FROM ("SCCS <discipline@yourschool.edu>")
//   SMTP:    SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASS, MAIL_FROM
//            (Google Workspace: smtp.gmail.com, 465, the account + an app password)
//
// Without either, sendMail() reports 'not_configured' and sends nothing; the
// caller records that, so nobody is told an email went out when it did not.
import nodemailer from 'nodemailer';

export type MailResult = 'sent' | 'not_configured' | 'failed';

export interface Mail {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

const from = () => process.env.MAIL_FROM || process.env.SMTP_USER || 'SCCS Student OS <onboarding@resend.dev>';

export async function sendMail(mail: Mail): Promise<MailResult> {
  const to = mail.to.filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
  if (to.length === 0) return 'failed';
  if (!mailConfigured()) return 'not_configured';
  try {
    if (process.env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from(), to, subject: mail.subject, text: mail.text, html: mail.html }),
      });
      if (!res.ok) {
        console.error('Resend error', res.status, await res.text().catch(() => ''));
        return 'failed';
      }
      return 'sent';
    }
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({ from: from(), to, subject: mail.subject, text: mail.text, html: mail.html });
    return 'sent';
  } catch (error) {
    console.error('Mail error:', (error as Error).message);
    return 'failed';
  }
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
