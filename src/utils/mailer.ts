import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function isMailConfigured(): boolean {
  return Boolean(env.smtpHost && env.mailFrom);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   env.smtpHost,
      port:   env.smtpPort,
      secure: env.smtpSecure || env.smtpPort === 465,
      ...(env.smtpUser ? { auth: { user: env.smtpUser, pass: env.smtpPass } } : {}),
    });
  }
  return transporter;
}

export async function sendMail(msg: MailMessage): Promise<boolean> {
  if (!isMailConfigured()) {
    console.warn(`[mailer] not configured — dropped "${msg.subject}" to ${msg.to}`);
    return false;
  }
  try {
    await getTransporter().sendMail({
      from:    env.mailFrom,
      to:      msg.to,
      subject: msg.subject,
      text:    msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    });
    return true;
  } catch (e) {
    console.error(`[mailer] failed to send "${msg.subject}" to ${msg.to}:`, (e as Error).message);
    return false;
  }
}

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Welcome to AskIndia!',
    text:
      `Hi ${name},\n\nWelcome to AskIndia! Your account has been created successfully.\n\n` +
      `Start exploring thousands of products and services from verified stores across India.\n\n` +
      `Shop now: ${env.frontendUrl}/shop\n\nThe AskIndia Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#1e293b;margin-bottom:8px">Welcome to AskIndia, ${name}! 🎉</h2>
        <p style="color:#475569;font-size:15px;line-height:1.6">
          Your account has been created successfully. You can now explore thousands of
          products and services from verified stores across India.
        </p>
        <div style="text-align:center;margin:32px 0">
          <a href="${env.frontendUrl}/shop"
             style="background:#4f46e5;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">
            Start Shopping
          </a>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">AskIndia Technologies Pvt. Ltd.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Reset your AskIndia password',
    text:
      `We received a request to reset the password for your AskIndia account.\n\n` +
      `Reset your password: ${resetLink}\n\n` +
      `This link expires in 1 hour and can be used once. ` +
      `If you didn't request this, you can safely ignore this message.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#1e293b;margin-bottom:8px">Password Reset</h2>
        <p style="color:#475569;font-size:15px;line-height:1.6">
          We received a request to reset the password for your AskIndia account.<br>
          Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
        </p>
        <div style="text-align:center;margin:32px 0">
          <a href="${resetLink}"
             style="background:#4f46e5;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">
            Reset Password
          </a>
        </div>
        <p style="color:#94a3b8;font-size:13px">
          If you didn't request this, you can safely ignore this email.<br>
          The link will expire automatically after 1 hour.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">AskIndia Technologies Pvt. Ltd.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetOtpEmail(to: string, otp: string, ttlMinutes: number): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Your AskIndia password reset code',
    text:
      `Your AskIndia password reset code is ${otp}.\n\n` +
      `It expires in ${ttlMinutes} minutes and can be used once. ` +
      `If you didn't request this, you can safely ignore this message.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#1e293b;margin-bottom:8px">Password Reset Code</h2>
        <p style="color:#475569;font-size:15px;line-height:1.6">Use this code to reset your AskIndia password. It expires in <strong>${ttlMinutes} minutes</strong>.</p>
        <p style="text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#1e293b;margin:32px 0">${otp}</p>
        <p style="color:#94a3b8;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="color:#94a3b8;font-size:12px;text-align:center">AskIndia Technologies Pvt. Ltd.</p>
      </div>
    `,
  });
}

export async function sendUsernameReminderEmail(to: string, username: string): Promise<boolean> {
  return sendMail({
    to,
    subject: 'Your AskIndia User ID',
    text:
      `You asked for the User ID of your AskIndia account.\n\n` +
      `User ID: ${username}\n\nSign in: ${env.frontendUrl}/login\n\n` +
      `If you didn't request this, you can safely ignore this message.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#1e293b;margin-bottom:8px">Your User ID</h2>
        <p style="color:#475569;font-size:15px;line-height:1.6">You asked for the User ID of your AskIndia account:</p>
        <p style="text-align:center;font-size:22px;font-weight:700;color:#1e293b;margin:24px 0">${username}</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${env.frontendUrl}/login"
             style="background:#4f46e5;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block">
            Sign In
          </a>
        </div>
        <p style="color:#94a3b8;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}
