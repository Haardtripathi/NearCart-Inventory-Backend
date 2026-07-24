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
        });
        transporterConfigured = true;
    }
    return cachedTransporter;
}
/**
 * Sends an email via the configured SMTP transport.
 *
 * When SMTP_HOST is not configured (e.g. local development without a mail provider), this
 * fails open by logging the email to the console instead of throwing — this keeps local dev
 * working without a mail server while still ensuring production (where SMTP_HOST must be set)
 * never leaks a raw token/link through an API response.
 */
async function sendMail(input) {
    const transporter = getTransporter();
    if (!transporter) {
        console.warn(`[mailer] SMTP_HOST is not configured — logging email instead of sending it. to=${input.to} subject=${input.subject}`);
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
