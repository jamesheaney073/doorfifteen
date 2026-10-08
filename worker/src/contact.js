import { buildInternalEmailHtml, buildReplyEmailHtml } from './email-template.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const TURNSTILE_VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const FROM_ADDRESS = 'Door Fifteen <noreply@doorfifteen.com>';
// Routed to the real, live Spec Check inbox for now — hello@doorfifteen.com
// isn't set up yet. Switch this once that mailbox exists.
const TO_ADDRESS = 'hello@speccheck.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Neither domain's DNS is on Cloudflare, so this worker is deployed to
// *.workers.dev rather than a zone route, and the frontend calls it
// cross-origin — hence the CORS handling below. The site is served
// identically from both doorfifteen.com and door15.com (same Netlify
// deployment), so both need to be allowed here and in the Turnstile
// widget's domain list.
const ALLOWED_ORIGINS = [
  'https://doorfifteen.com',
  'https://www.doorfifteen.com',
  'https://door15.com',
  'https://www.door15.com',
];

function corsHeaders(origin) {
  if (!ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

async function getNextEnquiryId(env) {
  const current = await env.ENQUIRY_COUNTER.get('count');
  const next = (parseInt(current, 10) || 0) + 1;
  await env.ENQUIRY_COUNTER.put('count', String(next));
  return next;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, cors);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return jsonResponse({ ok: false, error: 'Could not read form data.' }, 400, cors);
    }

    // Honeypot: real visitors never see or fill this field (hidden via
    // .hp-field in the page's CSS). Bots that fill every field get a fake
    // success so they don't learn to leave it blank.
    if ((form.get('company_website') || '').toString().trim()) {
      return jsonResponse({ ok: true }, 200, cors);
    }

    const name = (form.get('name') || '').toString().trim();
    const email = (form.get('email') || '').toString().trim();
    const company = (form.get('company') || '').toString().trim();
    const message = (form.get('message') || '').toString().trim();
    const topic = (form.get('topic') || '').toString().trim();
    const sourcePage = (form.get('source_page') || '').toString().trim();
    const turnstileToken = (form.get('cf-turnstile-response') || '').toString();

    if (!name) {
      return jsonResponse({ ok: false, error: 'Please enter your name.' }, 400, cors);
    }
    if (!email || !EMAIL_RE.test(email)) {
      return jsonResponse({ ok: false, error: 'Please enter a valid email address.' }, 400, cors);
    }
    if (!message) {
      return jsonResponse({ ok: false, error: 'Please enter a message.' }, 400, cors);
    }
    if (!turnstileToken) {
      return jsonResponse({ ok: false, error: 'Please complete the verification challenge.' }, 400, cors);
    }

    const verifyRes = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: turnstileToken,
        remoteip: request.headers.get('CF-Connecting-IP') || '',
      }),
    });
    const verifyData = await verifyRes.json().catch(() => ({ success: false }));
    if (!verifyRes.ok || !verifyData.success) {
      return jsonResponse({ ok: false, error: 'Verification failed. Please refresh the page and try again.' }, 400, cors);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'Unknown';
    const userAgent = request.headers.get('User-Agent') || '';
    const { city, region, country, timezone } = request.cf || {};

    // Sequential per-enquiry ID for the internal team's own reference. KV is
    // eventually consistent across edge locations, so this can in rare cases
    // skip or repeat a number under truly concurrent submissions - acceptable
    // for a low-volume contact form; switch to a Durable Object if that ever
    // needs to be a hard guarantee.
    const enquiryId = await getNextEnquiryId(env);

    const subjectBase = `New enquiry #${enquiryId} from ${name} via doorfifteen.com`.replace(/[\r\n]+/g, ' ');
    const emailData = { enquiryId, name, email, company, message, topic, sourcePage, ip, city, region, country, timezone, userAgent };

    const [internalRes, replyRes] = await Promise.all([
      fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Door Fifteen Internal <noreply@doorfifteen.com>',
          to: TO_ADDRESS,
          reply_to: TO_ADDRESS,
          subject: `${subjectBase} - internal details`,
          html: buildInternalEmailHtml(emailData),
        }),
      }),
      fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: TO_ADDRESS,
          reply_to: email,
          subject: subjectBase,
          html: buildReplyEmailHtml(emailData),
        }),
      }),
    ]);

    if (!internalRes.ok || !replyRes.ok) {
      return jsonResponse(
        { ok: false, error: 'Could not send your message right now. Please try again in a moment.' },
        502,
        cors
      );
    }

    return jsonResponse({ ok: true }, 200, cors);
  },
};
