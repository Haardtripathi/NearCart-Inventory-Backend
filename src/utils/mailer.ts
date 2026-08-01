import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../config/env";

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let cachedTransporter: Transporter | null = null;
let transporterConfigured = false;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) {
    return null;
  }

  if (!transporterConfigured) {
    cachedTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
      // Bug found 2026-08-01: with no explicit timeouts, nodemailer's default connectionTimeout
      // is 2 minutes — confirmed live against prod (a hung SMTP connection to smtp.gmail.com:587,
      // almost certainly blocked by the hosting provider's egress rules, took exactly ~2 minutes
      // to fail with 500). That means every OTP send against a blocked/unreachable SMTP endpoint
      // ties up the request (and whatever else shares that timing budget) for a full 2 minutes
      // before the client sees anything, which surfaces client-side as a generic "network error"
      // long before the server ever actually responds. Failing fast doesn't fix SMTP being
      // blocked, but it stops a single bad send from hanging this long — see mailer usage sites
      // for the real fix recommendation (switch to an HTTP-based email API).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
    transporterConfigured = true;
  }

  return cachedTransporter;
}

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Sends via Resend's HTTP API rather than raw SMTP — see RESEND_API_KEY's doc comment in
 * config/env.ts for why. A normal HTTPS POST isn't subject to the outbound-SMTP-port blocking
 * that broke raw SMTP in prod, and it fails in a bounded, ordinary HTTP-timeout way rather than
 * hanging for minutes.
 */
async function sendMailViaResend(input: SendMailInput) {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API request failed with status ${response.status}: ${body}`);
  }

  return { delivered: true as const };
}

/**
 * Sends an email via SMTP (preferred — Brevo's relay, confirmed 2026-08-01 to work for arbitrary
 * recipients with just a verified single sender, no domain needed) or Resend (fallback, only used
 * if SMTP_HOST is unset — Resend's free tier restricts sending to the account's own email until a
 * domain is verified there, so it's kept as a secondary option, not the primary one).
 *
 * When neither is configured (e.g. local development without a mail provider), this fails open
 * by logging the email to the console instead of throwing — this keeps local dev working without
 * a mail provider while still ensuring production (where one of the two must be set) never leaks
 * a raw token/link through an API response.
 */
export async function sendMail(input: SendMailInput) {
  const transporter = getTransporter();

  if (!transporter) {
    if (env.RESEND_API_KEY) {
      return sendMailViaResend(input);
    }

    console.warn(
      `[mailer] Neither SMTP_HOST nor RESEND_API_KEY is configured — logging email instead of sending it. to=${input.to} subject=${input.subject}`,
    );
    console.warn(`[mailer] body:\n${input.text ?? input.html}`);
    return { delivered: false as const };
  }

  const info = await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  // nodemailer.getTestMessageUrl() only returns a URL for Ethereal-style test accounts (used for
  // local testing) — it's a no-op (returns false) against a real provider, so this is safe to
  // always log and gives you a clickable preview link in dev instead of guessing whether the
  // send actually worked.
  const previewUrl = nodemailer.getTestMessageUrl(info);

  if (previewUrl) {
    console.log(`[mailer] preview: ${previewUrl}`);
  }

  return { delivered: true as const };
}

export function renderActionLinkEmail(input: { heading: string; intro: string; actionLabel: string; url: string; expiresAt: Date }) {
  const expires = input.expiresAt.toUTCString();

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>${input.heading}</h2>
      <p>${input.intro}</p>
      <p>
        <a href="${input.url}" style="display:inline-block;padding:10px 20px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;">
          ${input.actionLabel}
        </a>
      </p>
      <p>This link expires on ${expires}. If the button doesn't work, copy and paste this URL into your browser:</p>
      <p style="word-break:break-all;color:#4b5563;">${input.url}</p>
      <p>If you did not expect this email, you can safely ignore it.</p>
    </div>
  `;

  const text = `${input.heading}\n\n${input.intro}\n\n${input.actionLabel}: ${input.url}\n\nThis link expires on ${expires}. If you did not expect this email, you can safely ignore it.`;

  return { html, text };
}

export function renderOtpEmail(input: { code: string; ttlMinutes: number }) {
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Your verification code</h2>
      <p>Use the code below to verify your email address. It expires in ${input.ttlMinutes} minutes.</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;">${input.code}</p>
      <p>If you did not request this code, you can safely ignore this email.</p>
    </div>
  `;

  const text = `Your verification code is ${input.code}. It expires in ${input.ttlMinutes} minutes. If you did not request this code, you can safely ignore this email.`;

  return { html, text };
}
