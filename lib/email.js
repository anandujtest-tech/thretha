// Email provider abstraction for Thretha Couture
// Supports Resend REST API, SMTP, and explicit local development fallback

export async function sendEmail({ to, subject, html, text, idempotencyKey, timeoutMs }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Thretha Couture <onboarding@resend.dev>'

  if (!to) {
    throw new Error('Destination email address is required')
  }

  if (!apiKey) {
    console.warn(`[Email:Provider] RESEND_API_KEY is not configured in environment. Failed send to <${to}>.`)
    throw new Error('Email provider is not configured. Please set RESEND_API_KEY in environment.')
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': String(idempotencyKey).slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        text,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[Email:Resend] API error response:', err)
      const errorMsg = err.message || `Resend dispatch failed with status ${res.status}`
      const failure = new Error(errorMsg)
      failure.status = res.status
      failure.code = err.name || err.code
      throw failure
    }

    const data = await res.json()
    return { success: true, provider: 'resend', id: data.id }
  } catch (err) {
    console.error('[Email:Resend] Delivery error:', err.message)
    throw err
  }
}

/**
 * Send 6-digit login verification OTP
 */
export async function sendLoginOtp({ email, otp, name }) {
  const recipientName = name || 'Valued Customer'
  const subject = `Your Thretha Couture Verification Code: ${otp}`

  const text = `
Hello ${recipientName},

Your one-time login verification code for Thretha Couture is:

${otp}

This code will expire in 10 minutes. If you did not request this login, you can safely disregard this message.

With warmth & grace,
The Thretha Atelier Team
Kochi, Kerala
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Thretha Couture Verification Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF7F2; color: #141312;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FAF7F2; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="560px" style="max-width: 560px; background-color: #FFFFFF; border: 1px solid rgba(20, 19, 18, 0.08); padding: 40px; text-align: center;">
          <tr>
            <td style="padding-bottom: 20px;">
              <h1 style="font-family: Georgia, serif; font-size: 28px; font-weight: normal; letter-spacing: 0.15em; margin: 0; color: #141312;">THRETHA</h1>
              <p style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.3em; color: #C5A059; margin-top: 4px; font-weight: bold;">Contemporary Kerala Atelier</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 0; border-top: 1px solid rgba(20, 19, 18, 0.08); border-bottom: 1px solid rgba(20, 19, 18, 0.08);">
              <p style="font-size: 14px; color: #52453C; margin: 0 0 16px 0; line-height: 1.6;">
                Hello ${recipientName},<br>
                Please use the verification code below to sign in to your Thretha account:
              </p>
              <div style="display: inline-block; background-color: #FAF7F2; border: 1px solid #C5A059; padding: 14px 28px; font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 0.25em; color: #141312;">
                ${otp}
              </div>
              <p style="font-size: 11px; color: #7A685D; margin: 16px 0 0 0;">
                This code is valid for <strong>10 minutes</strong> and can only be used once.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 24px;">
              <p style="font-size: 11px; color: #8C7B6F; line-height: 1.5; margin: 0;">
                If you did not request this verification code, no action is needed.<br>
                © ${new Date().getFullYear()} Thretha Couture. Handcrafted with reverence in Kerala.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  return sendEmail({ to: email, subject, text, html })
}

/**
 * Send order confirmation dispatch
 */
export async function sendOrderConfirmationEmail({ email, order }) {
  const subject = `Order Confirmed: ${order.order_number} — Thretha Couture`
  const text = `Thank you for your order (${order.order_number}) with Thretha Couture. Total: ₹${order.total}.`
  const html = `<p>Thank you for your order <strong>${order.order_number}</strong> with Thretha Couture.</p>`

  return sendEmail({ to: email, subject, text, html })
}
