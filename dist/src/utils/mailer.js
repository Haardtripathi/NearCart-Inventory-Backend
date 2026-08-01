"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = sendMail;
exports.renderActionLinkEmail = renderActionLinkEmail;
exports.renderOtpEmail = renderOtpEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("../config/env");
let cachedTransporter = null;
let transporterConfigured = false;
function getTransporter() {
    if (!env_1.env.SMTP_HOST) {
        return null;
    }
    if (!transporterConfigured) {
        cachedTransporter = nodemailer_1.default.createTransport({
            host: env_1.env.SMTP_HOST,
            port: env_1.env.SMTP_PORT,
            secure: env_1.env.SMTP_SECURE,
            auth: env_1.env.SMTP_USER && env_1.env.SMTP_PASS
                ? {
                    user: env_1.env.SMTP_USER,
                    pass: env_1.env.SMTP_PASS,
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
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
/**
 * Parses "Display Name <email@domain>" into separate fields — Brevo's HTTP API wants them
 * split, unlike nodemailer/Resend which accept the combined string directly.
 */
function parseFromAddress(raw) {
    const match = raw.match(/^(.*)<(.+)>$/);
    if (!match) {
        return { email: raw.trim() };
    }
    const name = match[1].trim();
    const email = match[2].trim();
    return name ? { name, email } : { email };
}
/**
 * Sends via Brevo's HTTP API rather than its own SMTP relay — see BREVO_API_KEY's doc comment in
 * config/env.ts. Confirmed live 2026-08-01: Brevo's SMTP relay (smtp-relay.brevo.com:587) itself
 * gets ETIMEDOUT from some Render service instances despite identical credentials working fine
 * on others — a real per-service network egress restriction. A normal HTTPS POST isn't subject
 * to that at all.
 */
async function sendMailViaBrevo(input) {
    const response = await fetch(BREVO_API_URL, {
        method: "POST",
        headers: {
            "api-key": env_1.env.BREVO_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            sender: parseFromAddress(env_1.env.BREVO_FROM),
            to: [{ email: input.to }],
            subject: input.subject,
            htmlContent: input.html,
            textContent: input.text,
        }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Brevo API request failed with status ${response.status}: ${body}`);
    }
    return { delivered: true };
}
const RESEND_API_URL = "https://api.resend.com/emails";
/**
 * Sends via Resend's HTTP API rather than raw SMTP — see RESEND_API_KEY's doc comment in
 * config/env.ts for why. A normal HTTPS POST isn't subject to the outbound-SMTP-port blocking
 * that broke raw SMTP in prod, and it fails in a bounded, ordinary HTTP-timeout way rather than
 * hanging for minutes.
 */
async function sendMailViaResend(input) {
    const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env_1.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: env_1.env.RESEND_FROM,
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
    return { delivered: true };
}
/**
 * Sends an email via, in priority order: Brevo's HTTP API (most robust — HTTPS, not subject to
 * any SMTP-port-blocking, works for arbitrary recipients), raw SMTP (Brevo's relay — works on
 * some hosts, ETIMEDOUT on others per the network-egress issue above), or Resend's HTTP API
 * (fallback — also HTTPS-based, but its free tier restricts sending to the account's own email
 * until a domain is verified there).
 *
 * When none are configured (e.g. local development without a mail provider), this fails open
 * by logging the email to the console instead of throwing — this keeps local dev working without
 * a mail provider while still ensuring production (where one of these must be set) never leaks
 * a raw token/link through an API response.
 */
async function sendMail(input) {
    if (env_1.env.BREVO_API_KEY) {
        return sendMailViaBrevo(input);
    }
    const transporter = getTransporter();
    if (!transporter) {
        if (env_1.env.RESEND_API_KEY) {
            return sendMailViaResend(input);
        }
        console.warn(`[mailer] No email provider configured (BREVO_API_KEY / SMTP_HOST / RESEND_API_KEY all unset) — logging email instead of sending it. to=${input.to} subject=${input.subject}`);
        console.warn(`[mailer] body:\n${input.text ?? input.html}`);
        return { delivered: false };
    }
    const info = await transporter.sendMail({
        from: env_1.env.SMTP_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
    });
    // nodemailer.getTestMessageUrl() only returns a URL for Ethereal-style test accounts (used for
    // local testing) — it's a no-op (returns false) against a real provider, so this is safe to
    // always log and gives you a clickable preview link in dev instead of guessing whether the
    // send actually worked.
    const previewUrl = nodemailer_1.default.getTestMessageUrl(info);
    if (previewUrl) {
        console.log(`[mailer] preview: ${previewUrl}`);
    }
    return { delivered: true };
}
function renderActionLinkEmail(input) {
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
function renderOtpEmail(input) {
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
