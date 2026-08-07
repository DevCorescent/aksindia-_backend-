import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * True once SMTP credentials are present (SMTP_HOST + MAIL_FROM).
 * Callers use this to decide what to tell the user, rather than silently
 * pretending a message was delivered.
 */
export function isMailConfigured(): boolean {
  return Boolean(env.smtpHost && env.mailFrom);
}

// Built once on first send and reused — nodemailer pools connections internally.
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      // true for port 465 (implicit TLS); false for 587 (STARTTLS).
      secure: env.smtpSecure || env.smtpPort === 465,
      ...(env.smtpUser ? { auth: { user: env.smtpUser, pass: env.smtpPass } } : {}),
    });
  }
  return transporter;
}

/**
 * Delivers a message. Resolves to true only when the SMTP server accepted it —
 * a false return is a normal, handled path, never an exception for the caller.
 *
 * Works with any SMTP provider (Resend, SendGrid, SES, Postmark, Gmail…): set
 * SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS and MAIL_FROM. No code change needed.
 */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  if (!isMailConfigured()) {
    console.warn(`[mailer] not configured — dropped "${msg.subject}" to ${msg.to}`);
    return false;
  }

  try {
    await getTransporter().sendMail({
      from: env.mailFrom,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    });
    return true;
  } catch (e) {
    console.error(`[mailer] failed to send "${msg.subject}" to ${msg.to}:`, (e as Error).message);
    return false;
  }
}

/** Sends the password reset link. Returns false when nothing was delivered. */
export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Reset your AskIndia password',
    text:
      `We received a request to reset the password for your AskIndia account.\n\n` +
      `Reset your password: ${resetLink}\n\n` +
      `This link expires in 1 hour and can be used once. ` +
      `If you didn't request this, you can safely ignore this message.`,
    html:
      `<p>We received a request to reset the password for your AskIndia account.</p>` +
      `<p><a href="${resetLink}">Reset your password</a></p>` +
      `<p>This link expires in 1 hour and can be used once. ` +
      `If you didn't request this, you can safely ignore this message.</p>`,
  });
}
