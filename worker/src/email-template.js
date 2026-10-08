// Inline-styled, table-based HTML so the layout survives Outlook/Gmail's
// stripped-down CSS support.

const ACCENT = '#3B4FE0';
const INK = '#0E1116';
const PAPER = '#F6F5F1';
const STEEL = '#6B7480';
const LINE = '#E6E4DE';

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function describeBrowser(ua) {
  if (!ua) return '';
  let browser = 'Unknown browser';
  if (/Edg\//.test(ua)) browser = `Edge ${(ua.match(/Edg\/([\d.]+)/) || [])[1] || ''}`.trim();
  else if (/OPR\//.test(ua)) browser = `Opera ${(ua.match(/OPR\/([\d.]+)/) || [])[1] || ''}`.trim();
  else if (/Firefox\//.test(ua)) browser = `Firefox ${(ua.match(/Firefox\/([\d.]+)/) || [])[1] || ''}`.trim();
  else if (/Chrome\//.test(ua)) browser = `Chrome ${(ua.match(/Chrome\/([\d.]+)/) || [])[1] || ''}`.trim();
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = `Safari ${(ua.match(/Version\/([\d.]+)/) || [])[1] || ''}`.trim();

  let os = '';
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return os ? `${browser} on ${os}` : browser;
}

function row(label, value) {
  if (!value) return '';
  return `
    <tr>
      <td style="padding:14px 0; border-bottom:1px solid ${LINE};">
        <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:${STEEL};">${label}</div>
        <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; color:${INK}; margin-top:4px;">${value}</div>
      </td>
    </tr>`;
}

function safeFields({ enquiryId, name, email, company, message, topic, sourcePage, ip, city, region, country, timezone, userAgent }) {
  return {
    enquiryId: enquiryId ? `#${enquiryId}` : '',
    name: escapeHtml(name),
    email: escapeHtml(email),
    company: company ? escapeHtml(company) : '',
    message: escapeHtml(message).replace(/\n/g, '<br>'),
    topic: topic ? escapeHtml(topic) : '',
    sourcePage: sourcePage ? escapeHtml(sourcePage) : '',
    location: escapeHtml([city, region, country].filter(Boolean).join(', ')),
    timezone: escapeHtml(timezone || ''),
    ip: escapeHtml(ip || 'Unknown'),
    browser: escapeHtml(describeBrowser(userAgent || '')),
  };
}

function shell({ badgeHtml = '', rowsHtml, footerText }) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background:${PAPER};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#FFFFFF; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="background:${INK}; padding:24px 32px;">
                <span style="font-family:Arial,Helvetica,sans-serif; font-size:19px; font-weight:700; letter-spacing:-0.01em; color:#FFFFFF;">
                  Door Fifteen
                </span>
              </td>
            </tr>
            ${badgeHtml}
            <tr>
              <td style="padding:28px 32px 8px;">
                <h1 style="margin:0 0 8px; font-family:Arial,Helvetica,sans-serif; font-size:20px; color:${INK};">New contact form enquiry</h1>
                <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:14px; color:${STEEL};">Submitted via the contact form on doorfifteen.com.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 4px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${rowsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;">
                <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:${STEEL};">${footerText}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const INTERNAL_BADGE = `
  <tr>
    <td style="padding:16px 32px 0;">
      <span style="display:inline-block; font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${ACCENT}; border:1px solid ${ACCENT}; border-radius:4px; padding:4px 10px;">Internal Use Only - Do Not Forward</span>
    </td>
  </tr>`;

export function buildInternalEmailHtml(data) {
  const f = safeFields(data);
  const rows = `
    ${row('Enquiry ID', f.enquiryId)}
    ${row('Name', f.name)}
    ${row('Email', `<a href="mailto:${f.email}" style="color:${ACCENT}; text-decoration:none;">${f.email}</a>`)}
    ${row('Company', f.company)}
    ${row('How can we help?', f.topic)}
    ${row('Message', f.message)}
    ${row('Submitted From', f.sourcePage)}
    ${row('Location', f.location)}
    ${row('Time Zone', f.timezone)}
    ${row('Browser', f.browser)}
    ${row('IP Address', f.ip)}`;

  return shell({
    badgeHtml: INTERNAL_BADGE,
    rowsHtml: rows,
    footerText: `This copy is for internal reference only - reply to the other email in this notification to respond to ${f.name}.`,
  });
}

export function buildReplyEmailHtml(data) {
  const f = safeFields(data);
  const rows = `
    ${row('Enquiry ID', f.enquiryId)}
    ${row('Name', f.name)}
    ${row('Email', `<a href="mailto:${f.email}" style="color:${ACCENT}; text-decoration:none;">${f.email}</a>`)}
    ${row('Company', f.company)}
    ${row('How can we help?', f.topic)}
    ${row('Message', f.message)}`;

  return shell({
    rowsHtml: rows,
    footerText: `Reply directly to this email to respond to ${f.name}.`,
  });
}
