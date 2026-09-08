/**
 * Optional email copy of wind alerts (Resend).
 * Uses RESEND_API_KEY + WINDSAGE_EMAIL_FROM on Wald.
 */
export function alertEmailConfig() {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.WINDSAGE_EMAIL_FROM || 'Windsage <onboarding@resend.dev>').trim();
  return {
    enabled: !!(apiKey && from),
    apiKey,
    from,
  };
}

export async function sendAlertEmail({ title, body, to } = {}) {
  const cfg = alertEmailConfig();
  const dest = String(to || '').trim();
  if (!cfg.enabled || !dest) return { ok: false, skipped: true };
  const subject = String(title || 'Windsage alert').slice(0, 180);
  const text = String(body || '').trim() || subject;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [dest],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[alert-email] resend failed', response.status, errText.slice(0, 200));
      return { ok: false, status: response.status };
    }
    console.log('[alert-email] sent');
    return { ok: true };
  } catch (error) {
    console.error('[alert-email] send failed', error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}
