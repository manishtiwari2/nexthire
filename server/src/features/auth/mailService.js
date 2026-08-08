const { authConfig } = require('./authConfig');

/**
 * Transactional email with a swappable provider.
 *
 * `MAIL_PROVIDER` selects the transport; every provider implements the same
 * `send({ to, subject, text, html })` contract, so switching from dev logging to a real
 * ESP is configuration only — no calling code changes.
 *
 *   console  — dev default. Logs the message (and any link) to stdout. Nothing is sent.
 *   smtp     — nodemailer over SMTP_URL. The usual production choice.
 *   resend   — Resend HTTP API with MAIL_API_KEY.
 *   sendgrid — SendGrid v3 HTTP API with MAIL_API_KEY.
 *
 * Production refuses to boot with `console` (see assertProductionConfig), so a
 * misconfigured deploy can never silently swallow verification emails.
 */

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

const consoleTransport = {
  name: 'console',
  async send({ to, subject, text }) {
    const banner = '─'.repeat(72);
    // A single grouped block so the dev can copy the link straight out of the terminal.
    console.log(
      [
        `\n${banner}`,
        `📧  [mail:console] would send an email`,
        `    To      : ${to}`,
        `    Subject : ${subject}`,
        banner,
        text,
        `${banner}\n`,
      ].join('\n')
    );
    return { delivered: false, provider: 'console' };
  },
};

/** nodemailer is required lazily so the dependency is optional at runtime. */
let smtpTransporter = null;
const smtpTransport = {
  name: 'smtp',
  async send({ to, subject, text, html }) {
    if (!smtpTransporter) {
      // eslint-disable-next-line global-require -- optional dependency, loaded on first use
      const nodemailer = require('nodemailer');
      smtpTransporter = nodemailer.createTransport(authConfig.mail.smtpUrl);
    }
    await smtpTransporter.sendMail({ from: authConfig.mail.from, to, subject, text, html });
    return { delivered: true, provider: 'smtp' };
  },
};

const resendTransport = {
  name: 'resend',
  async send({ to, subject, text, html }) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authConfig.mail.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: authConfig.mail.from, to: [to], subject, text, html }),
    });
    if (!response.ok) {
      throw new Error(`Resend rejected the message (HTTP ${response.status})`);
    }
    return { delivered: true, provider: 'resend' };
  },
};

const sendgridTransport = {
  name: 'sendgrid',
  async send({ to, subject, text, html }) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authConfig.mail.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: parseAddress(authConfig.mail.from) },
        subject,
        content: [
          { type: 'text/plain', value: text },
          ...(html ? [{ type: 'text/html', value: html }] : []),
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`SendGrid rejected the message (HTTP ${response.status})`);
    }
    return { delivered: true, provider: 'sendgrid' };
  },
};

/** Pull the bare address out of a `Name <addr@host>` string. */
function parseAddress(from) {
  const match = /<([^>]+)>/.exec(from || '');
  return match ? match[1] : from;
}

const TRANSPORTS = {
  console: consoleTransport,
  smtp: smtpTransport,
  resend: resendTransport,
  sendgrid: sendgridTransport,
};

function transport() {
  return TRANSPORTS[authConfig.mail.provider] || consoleTransport;
}

/**
 * Send a message. Delivery failures are logged and reported in the return value rather
 * than thrown: a registration must not fail because an ESP had a bad minute — the user
 * can always request a new verification link.
 */
async function sendMail({ to, subject, text, html }) {
  try {
    return await transport().send({ to, subject, text, html });
  } catch (err) {
    console.error(`[mail] delivery failed via ${transport().name}:`, err.message);
    return { delivered: false, provider: transport().name, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function layout({ heading, body, ctaLabel, ctaUrl, footer }) {
  return `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1d23">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <tr><td style="font-size:18px;font-weight:700;padding-bottom:8px">NextHire</td></tr>
      <tr><td style="font-size:20px;font-weight:600;padding:8px 0 12px">${heading}</td></tr>
      <tr><td style="font-size:14px;line-height:1.6;color:#4a5060">${body}</td></tr>
      <tr><td style="padding:24px 0">
        <a href="${ctaUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px">${ctaLabel}</a>
      </td></tr>
      <tr><td style="font-size:12px;line-height:1.6;color:#8b90a0;border-top:1px solid #eceef2;padding-top:16px">
        ${footer}<br><br>If the button does not work, paste this link into your browser:<br>
        <span style="word-break:break-all;color:#4f46e5">${ctaUrl}</span>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function minutesOrHours(seconds) {
  return seconds >= 3600
    ? `${Math.round(seconds / 3600)} hour${seconds >= 7200 ? 's' : ''}`
    : `${Math.round(seconds / 60)} minutes`;
}

async function sendVerificationEmail({ to, name, token }) {
  const url = `${authConfig.clientUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const validFor = minutesOrHours(authConfig.emailVerificationTtlSec);
  return sendMail({
    to,
    subject: 'Verify your NextHire email address',
    text: `Hi ${name || 'there'},\n\nConfirm your email address to activate your NextHire account:\n\n${url}\n\nThis link expires in ${validFor}. If you did not create an account, you can ignore this email.`,
    html: layout({
      heading: 'Confirm your email address',
      body: `Hi ${escapeHtml(name || 'there')}, welcome to NextHire. Confirm your email address to activate your account and start practising.`,
      ctaLabel: 'Verify email address',
      ctaUrl: url,
      footer: `This link expires in ${validFor}. If you did not create a NextHire account, you can safely ignore this email.`,
    }),
  });
}

async function sendPasswordResetEmail({ to, name, token }) {
  const url = `${authConfig.clientUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const validFor = minutesOrHours(authConfig.passwordResetTtlSec);
  return sendMail({
    to,
    subject: 'Reset your NextHire password',
    text: `Hi ${name || 'there'},\n\nUse this link to choose a new NextHire password:\n\n${url}\n\nThis link expires in ${validFor} and can only be used once. If you did not request a password reset, no action is needed.`,
    html: layout({
      heading: 'Reset your password',
      body: `Hi ${escapeHtml(name || 'there')}, we received a request to reset the password for your NextHire account. Choose a new password using the button below.`,
      ctaLabel: 'Choose a new password',
      ctaUrl: url,
      footer: `This link expires in ${validFor} and can only be used once. If you did not request a reset, no action is needed — your password has not changed.`,
    }),
  });
}

async function sendPasswordChangedEmail({ to, name }) {
  const url = `${authConfig.clientUrl}/login`;
  return sendMail({
    to,
    subject: 'Your NextHire password was changed',
    text: `Hi ${name || 'there'},\n\nYour NextHire password was just changed and every other device has been signed out.\n\nIf this was not you, reset your password immediately: ${authConfig.clientUrl}/forgot-password`,
    html: layout({
      heading: 'Your password was changed',
      body: `Hi ${escapeHtml(name || 'there')}, your NextHire password was just changed. For your security, every other signed-in device has been logged out.`,
      ctaLabel: 'Sign in',
      ctaUrl: url,
      footer: 'If this was not you, reset your password immediately and contact support.',
    }),
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  activeProvider: () => transport().name,
};
