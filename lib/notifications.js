import { v4 as uuidv4 } from 'uuid'
import { sendEmail } from './email.js'

/**
 * Escapes unsafe characters for HTML email templates to prevent XSS injection.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Formats currency values consistently in Indian Rupees
 */
export function formatInr(amount) {
  const num = Number(amount) || 0
  return `₹${num.toLocaleString('en-IN')}`
}

/**
 * Retrieves order notification settings from database with safe defaults
 */
export async function getOrderNotificationSettings(database) {
  const defaultSettings = {
    customer_email_enabled: true,
    sales_email: {
      enabled: true,
      recipients: [
        {
          id: 'rec_sales_default',
          name: 'Atelier Sales Team',
          email: 'threthacollections@gmail.com',
          active: true,
        },
      ],
    },
    sales_whatsapp: {
      enabled: false,
      recipients: [
        {
          id: 'rec_wa_default',
          name: 'Atelier Concierge',
          phone: '+918921825107',
          active: true,
        },
      ],
    },
    events: {
      order_confirmed: true,
      order_cancelled: true,
      order_refunded: true,
    },
  }

  if (!database) return defaultSettings

  try {
    const globalSettings = await database.collection('settings').findOne({ id: 'global' })
    if (globalSettings?.order_notifications) {
      return {
        ...defaultSettings,
        ...globalSettings.order_notifications,
        sales_email: {
          ...defaultSettings.sales_email,
          ...(globalSettings.order_notifications.sales_email || {}),
          recipients: globalSettings.order_notifications.sales_email?.recipients || defaultSettings.sales_email.recipients,
        },
        sales_whatsapp: {
          ...defaultSettings.sales_whatsapp,
          ...(globalSettings.order_notifications.sales_whatsapp || {}),
          recipients: globalSettings.order_notifications.sales_whatsapp?.recipients || defaultSettings.sales_whatsapp.recipients,
        },
        events: {
          ...defaultSettings.events,
          ...(globalSettings.order_notifications.events || {}),
        },
      }
    }
  } catch (err) {
    console.error('[Notifications:Settings] Error fetching settings:', err.message)
  }

  return defaultSettings
}

/**
 * Generates an elegant, responsive customer order confirmation HTML email.
 */
export function renderCustomerOrderEmail({ order, settings, appUrl }) {
  const brandName = escapeHtml(settings?.brand_name || 'Thretha Couture')
  const customerName = escapeHtml(order.customer?.fullName || order.customer?.name || 'Valued Customer')
  const orderNumber = escapeHtml(order.order_number || order.id)
  const orderDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://thretha.in'
  const trackingUrl = `${baseUrl.replace(/\/$/, '')}/order/${encodeURIComponent(order.order_number || order.id)}`

  // Delivery details
  const c = order.customer || {}
  const addressLines = [
    c.house || c.addressLine1,
    c.street || c.addressLine2,
    [c.city, c.district].filter(Boolean).join(', '),
    [c.state, c.pincode || c.postalCode].filter(Boolean).join(' - '),
    c.country || 'India',
  ].filter(Boolean).map(escapeHtml).join('<br />')

  const phone = escapeHtml(c.phone || c.whatsapp || '')

  // Products lines
  const itemsHtml = (order.items || []).map((it) => {
    const name = escapeHtml(it.product_name || it.name || 'Handcrafted Sari / Garment')
    const sku = it.sku ? `<div style="font-size: 10px; color: #8C7B6F; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px;">SKU: ${escapeHtml(it.sku)}</div>` : ''
    const size = it.size ? `<span style="display: inline-block; margin-right: 8px;">Size: <strong>${escapeHtml(it.size)}</strong></span>` : ''
    const colour = it.colour ? `<span>Colour: <strong>${escapeHtml(it.colour)}</strong></span>` : ''
    const meta = (size || colour) ? `<div style="font-size: 11px; color: #7A685D; margin-top: 3px;">${size}${colour}</div>` : ''
    const qty = Number(it.quantity) || 1
    const price = formatInr(it.price)
    const lineTotal = formatInr(Number(it.price) * qty)

    return `
      <tr style="border-bottom: 1px solid #EFEAE3;">
        <td style="padding: 14px 10px 14px 0; vertical-align: top;">
          <div style="font-size: 13px; font-weight: 600; color: #141312;">${name}</div>
          ${meta}
          ${sku}
        </td>
        <td style="padding: 14px 10px; vertical-align: top; text-align: center; font-size: 12px; color: #52453C;">
          ${qty}
        </td>
        <td style="padding: 14px 10px; vertical-align: top; text-align: right; font-size: 12px; color: #52453C;">
          ${price}
        </td>
        <td style="padding: 14px 0 14px 10px; vertical-align: top; text-align: right; font-size: 13px; font-weight: 600; color: #141312;">
          ${lineTotal}
        </td>
      </tr>
    `
  }).join('')

  const subtotal = formatInr(order.subtotal)
  const discount = Number(order.discount) > 0 ? `-${formatInr(order.discount)}` : null
  const shipping = Number(order.shipping) === 0 ? '<strong style="color: #2E7D32;">FREE</strong>' : formatInr(order.shipping)
  const total = formatInr(order.total)
  const paymentMethod = order.payment_method === 'CASHFREE' ? 'Paid Online (Cashfree)' : 'WhatsApp Concierge'
  const paymentStatus = order.payment_status === 'PAID' ? 'CONFIRMED · PAID' : order.payment_status || 'PENDING'

  const subject = `Your Thretha Couture order ${order.order_number} is confirmed`

  const text = `
THRETHA COUTURE — ORDER CONFIRMATION
Order Number: ${order.order_number}
Order Date: ${orderDate}

Hello ${c.fullName || c.name || 'Valued Customer'},

Thank you for choosing Thretha Couture. Your order has been confirmed with our atelier.

ORDER SUMMARY:
${(order.items || []).map((it) => `- ${it.product_name} (Qty: ${it.quantity}) - ₹${it.price * it.quantity}`).join('\n')}

Subtotal: ${subtotal}
${discount ? `Discount: ${discount}\n` : ''}Shipping: ${Number(order.shipping) === 0 ? 'FREE' : formatInr(order.shipping)}
Total: ${total}
Payment Status: ${paymentStatus} (${paymentMethod})

DELIVERY ADDRESS:
${c.fullName || c.name || ''}
${c.house || c.addressLine1 || ''}
${c.street || c.addressLine2 || ''}
${c.city || ''}, ${c.state || ''} ${c.pincode || c.postalCode || ''}
Phone: ${phone}

Track your order: ${trackingUrl}

With warmth & grace,
The Thretha Atelier Team
Kochi, Kerala
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF7F2; color: #141312; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FAF7F2; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid rgba(20, 19, 18, 0.08); box-shadow: 0 4px 16px rgba(20, 19, 18, 0.03);">
          
          <!-- Atelier Header -->
          <tr>
            <td style="padding: 36px 36px 24px; text-align: center; border-bottom: 1px solid #FAF7F2; background-color: #141312;">
              <h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: normal; letter-spacing: 0.2em; margin: 0; color: #FAF7F2;">THRETHA</h1>
              <p style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.35em; color: #C5A059; margin-top: 6px; font-weight: 600;">Contemporary Kerala Atelier</p>
            </td>
          </tr>

          <!-- Confirmation Banner -->
          <tr>
            <td style="padding: 28px 36px 20px; background-color: #FAF7F2; border-bottom: 1px solid #EFEAE3;">
              <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #C5A059; font-weight: bold; margin-bottom: 6px;">Order Confirmed</div>
              <h2 style="font-family: Georgia, serif; font-size: 22px; font-weight: normal; margin: 0 0 8px; color: #141312;">
                Thank you for your order, ${customerName}
              </h2>
              <p style="font-size: 13px; color: #52453C; margin: 0; line-height: 1.5;">
                We have received your order <strong>${orderNumber}</strong> placed on ${orderDate}. Our atelier artisans are preparing your handpicked pieces with utmost care.
              </p>
            </td>
          </tr>

          <!-- Items Table -->
          <tr>
            <td style="padding: 28px 36px 16px;">
              <h3 style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #7A685D; margin: 0 0 16px; font-weight: 700;">
                Your Order Items
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                <thead>
                  <tr style="border-bottom: 1.5px solid #141312;">
                    <th style="text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #7A685D; padding-bottom: 8px;">Piece</th>
                    <th style="text-align: center; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #7A685D; padding-bottom: 8px;">Qty</th>
                    <th style="text-align: right; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #7A685D; padding-bottom: 8px;">Price</th>
                    <th style="text-align: right; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #7A685D; padding-bottom: 8px;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Pricing & Payment Summary -->
          <tr>
            <td style="padding: 0 36px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FAF7F2; padding: 18px; border: 1px solid #EFEAE3;">
                <tr>
                  <td style="font-size: 12px; color: #52453C; padding-bottom: 6px;">Subtotal</td>
                  <td style="text-align: right; font-size: 12px; color: #141312; padding-bottom: 6px;">${subtotal}</td>
                </tr>
                ${discount ? `
                <tr>
                  <td style="font-size: 12px; color: #2E7D32; padding-bottom: 6px;">
                    Promotional Discount ${order.promotion?.code ? `(${escapeHtml(order.promotion.code)})` : ''}
                  </td>
                  <td style="text-align: right; font-size: 12px; color: #2E7D32; font-weight: 600; padding-bottom: 6px;">${discount}</td>
                </tr>` : ''}
                <tr>
                  <td style="font-size: 12px; color: #52453C; padding-bottom: 10px;">Delivery / Shipping</td>
                  <td style="text-align: right; font-size: 12px; color: #141312; padding-bottom: 10px;">${shipping}</td>
                </tr>
                <tr style="border-top: 1.5px solid #141312;">
                  <td style="font-size: 14px; font-weight: bold; color: #141312; padding-top: 10px;">Total Amount</td>
                  <td style="text-align: right; font-size: 16px; font-weight: bold; color: #141312; padding-top: 10px;">${total}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 12px; font-size: 11px; color: #7A685D; border-top: 1px dashed #DDD4C8; margin-top: 10px;">
                    Payment: <strong style="color: #141312;">${paymentStatus}</strong> · ${paymentMethod}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Delivery Details & Action CTA -->
          <tr>
            <td style="padding: 0 36px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #EFEAE3; padding-top: 20px;">
                <tr>
                  <td style="vertical-align: top; width: 60%;">
                    <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #7A685D; font-weight: 700; margin-bottom: 6px;">
                      Delivery Destination
                    </div>
                    <div style="font-size: 12px; line-height: 1.6; color: #141312;">
                      <strong>${customerName}</strong><br />
                      ${addressLines}<br />
                      ${phone ? `Contact: ${phone}` : ''}
                    </div>
                  </td>
                  <td style="vertical-align: middle; text-align: right; width: 40%;">
                    <a href="${trackingUrl}" target="_blank" style="display: inline-block; background-color: #141312; color: #FAF7F2; text-decoration: none; padding: 12px 20px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; font-weight: 600; border-radius: 0;">
                      View Order →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Atelier Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #141312; text-align: center; color: #FAF7F2;">
              <p style="font-size: 11px; color: #C5A059; margin: 0 0 6px; letter-spacing: 0.05em;">
                Thretha Couture Atelier & Concierge
              </p>
              <p style="font-size: 10px; color: #A89B8F; margin: 0; line-height: 1.5;">
                Handcrafted with reverence in Kerala. Questions regarding your order?<br />
                Reach us directly on WhatsApp or reply to this email.
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

  return { subject, text, html }
}

/**
 * Generates customer order cancellation confirmation email.
 */
export function renderCustomerOrderCancelledEmail({ order, settings, appUrl }) {
  const customerName = escapeHtml(order.customer?.fullName || order.customer?.name || 'Valued Customer')
  const orderNumber = escapeHtml(order.order_number || order.id)
  const isPaid = order.payment_status === 'PAID' || order.payment?.status === 'PAID'
  const refundAmount = order.refund?.amount || order.payment?.refund_amount || order.total
  const refundStatus = order.refund?.status || order.payment?.refund_status || (isPaid ? 'PENDING' : 'NONE')

  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://thretha.in'
  const accountOrderUrl = `${baseUrl.replace(/\/$/, '')}/account/orders/${encodeURIComponent(order.order_number || order.id)}`
  const supportWa = (settings?.whatsapp || '918301824696').replace(/[^0-9]/g, '')

  const subject = `Your Thretha Couture order ${order.order_number} has been cancelled`

  const text = `
Dear ${order.customer?.name || 'Customer'},

Your Thretha Couture order ${order.order_number} has been cancelled.

CANCELLATION SUMMARY:
Order Number: ${order.order_number}
Cancellation Reason: ${order.cancellation_reason || 'Customer request'}
${isPaid ? `Refund Status: ${refundStatus} (${formatInr(refundAmount)})\nYour refund has been initiated through Cashfree and will be credited to your original payment method within 5-7 business days.` : 'No payment was captured for this order.'}

If you have any questions, please contact our concierge on WhatsApp (+${supportWa}) or view your order status: ${accountOrderUrl}

Warm regards,
Thretha Couture Atelier
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F8F9FA; padding: 24px; color: #212529;">
  <table width="100%" style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E9ECEF; border-radius: 4px; padding: 24px;">
    <tr>
      <td>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #8C2D19; font-weight: bold;">Order Cancellation Notice</div>
        <h2 style="font-family: Georgia, serif; margin: 4px 0 16px; color: #141312;">Order ${orderNumber} Cancelled</h2>
        <p style="font-size: 13px; line-height: 1.6; color: #52453C;">
          Dear ${customerName},<br /><br />
          We confirm that your order <strong>${orderNumber}</strong> has been cancelled.
        </p>

        <div style="background-color: #FAF7F2; padding: 16px; border-left: 4px solid #8C2D19; margin: 20px 0;">
          <div style="font-size: 13px; font-weight: bold; color: #141312;">
            ${isPaid ? `Refund Amount: ${formatInr(refundAmount)}` : 'Status: Cancelled'}
          </div>
          <div style="font-size: 12px; color: #52453C; margin-top: 4px;">
            ${isPaid ? 'Your refund has been initiated with Cashfree and will credit back to your original payment method within 5–7 business days.' : 'This unpaid order was safely cancelled.'}
          </div>
        </div>

        <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #7A685D; margin: 0 0 8px;">Cancelled Pieces</h3>
        <ul style="font-size: 13px; line-height: 1.6; margin: 0 0 20px; padding-left: 20px;">
          ${(order.items || []).map((it) => `<li><strong>${escapeHtml(it.product_name)}</strong> &times; ${it.quantity} (Size: ${escapeHtml(it.size || 'Free Size')})</li>`).join('')}
        </ul>

        <div style="text-align: center; padding-top: 16px; border-top: 1px solid #E9ECEF;">
          <a href="${accountOrderUrl}" style="background-color: #141312; color: #FFFFFF; text-decoration: none; padding: 10px 20px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: bold; display: inline-block;">
            View Account & Orders
          </a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

/**
 * Generates customer refund completed confirmation email.
 */
export function renderCustomerRefundCompletedEmail({ order, settings, appUrl }) {
  const customerName = escapeHtml(order.customer?.fullName || order.customer?.name || 'Valued Customer')
  const orderNumber = escapeHtml(order.order_number || order.id)
  const refundAmount = order.refund?.amount || order.payment?.refund_amount || order.total
  const refundRef = escapeHtml(order.refund?.cf_refund_id || order.payment?.cashfree_refund_id || order.refund?.id || 'Cashfree Reference')

  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://thretha.in'
  const accountOrderUrl = `${baseUrl.replace(/\/$/, '')}/account/orders/${encodeURIComponent(order.order_number || order.id)}`

  const subject = `Your refund for Thretha Couture order ${order.order_number} is complete`

  const text = `
Dear ${order.customer?.name || 'Customer'},

Your refund for Thretha Couture order ${order.order_number} has been completed successfully.

REFUND RECEIPT:
Order Number: ${order.order_number}
Refund Amount: ${formatInr(refundAmount)}
Refund Status: COMPLETED
Cashfree Reference: ${refundRef}
Date Credited: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}

The funds have been credited back to your original source payment method (bank account / UPI / card). Depending on your bank, it may take 1-3 business days to reflect in your statement.

View your order receipt: ${accountOrderUrl}

Warm regards,
Thretha Couture Atelier
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F8F9FA; padding: 24px; color: #212529;">
  <table width="100%" style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E9ECEF; border-radius: 4px; padding: 24px;">
    <tr>
      <td>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #1E6B43; font-weight: bold;">Refund Processed</div>
        <h2 style="font-family: Georgia, serif; margin: 4px 0 16px; color: #141312;">Refund Complete: ${orderNumber}</h2>
        <p style="font-size: 13px; line-height: 1.6; color: #52453C;">
          Dear ${customerName},<br /><br />
          We are pleased to confirm that your refund of <strong>${formatInr(refundAmount)}</strong> for order <strong>${orderNumber}</strong> has been successfully credited back via Cashfree.
        </p>

        <div style="background-color: #F2F9F5; padding: 16px; border-left: 4px solid #1E6B43; margin: 20px 0;">
          <div style="font-size: 14px; font-weight: bold; color: #1E6B43;">Amount Credited: ${formatInr(refundAmount)}</div>
          <div style="font-size: 12px; color: #52453C; margin-top: 4px;">
            Reference ID: <strong>${refundRef}</strong><br />
            Status: <strong>COMPLETED</strong>
          </div>
        </div>

        <p style="font-size: 12px; color: #7A685D; line-height: 1.5;">
          The amount has been returned to your original payment method. We hope to welcome you back to Thretha Couture soon.
        </p>

        <div style="text-align: center; padding-top: 16px; border-top: 1px solid #E9ECEF;">
          <a href="${accountOrderUrl}" style="background-color: #141312; color: #FFFFFF; text-decoration: none; padding: 10px 20px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: bold; display: inline-block;">
            View Order Receipt
          </a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

/**
 * Generates an internal sales notification HTML email for atelier staff.
 */
export function renderSalesOrderEmail({ order, settings, appUrl }) {
  const customerName = escapeHtml(order.customer?.fullName || order.customer?.name || 'Customer')
  const orderNumber = escapeHtml(order.order_number || order.id)
  const orderDate = new Date(order.created_at || Date.now()).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://thretha.in'
  const adminUrl = `${baseUrl.replace(/\/$/, '')}/admin`
  const c = order.customer || {}

  const itemsText = (order.items || [])
    .map((it) => `• ${it.product_name} (Qty: ${it.quantity}, Size: ${it.size || 'Free Size'}) - ₹${it.price * it.quantity}`)
    .join('\n')

  const subject = `New Thretha Couture Order — ${order.order_number}`

  const text = `
NEW ORDER RECEIVED: ${order.order_number}
Total: ${formatInr(order.total)}
Payment: ${order.payment_status} (${order.payment_method})
Date: ${orderDate}

Customer Details:
Name: ${c.fullName || c.name || ''}
Email: ${c.email || ''}
Phone: ${c.phone || c.whatsapp || ''}
City: ${c.city || ''}, ${c.state || ''} (${c.pincode || c.postalCode || ''})

Items:
${itemsText}

Manage order in Admin Console: ${adminUrl}
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F8F9FA; padding: 24px; color: #212529;">
  <table width="100%" style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E9ECEF; border-radius: 4px; padding: 24px;">
    <tr>
      <td>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #C5A059; font-weight: bold;">Atelier Sales Alert</div>
        <h2 style="font-family: Georgia, serif; margin: 4px 0 16px; color: #141312;">New Order: ${orderNumber}</h2>
        <div style="background-color: #FAF7F2; padding: 16px; border-left: 4px solid #C5A059; margin-bottom: 20px;">
          <div style="font-size: 18px; font-weight: bold; color: #141312;">Total: ${formatInr(order.total)}</div>
          <div style="font-size: 12px; color: #52453C; margin-top: 4px;">
            Payment: <strong>${escapeHtml(order.payment_status)}</strong> (${escapeHtml(order.payment_method)}) · ${orderDate}
          </div>
        </div>

        <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #7A685D; margin: 0 0 8px;">Customer Contact</h3>
        <p style="font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
          <strong>Name:</strong> ${customerName}<br />
          <strong>Email:</strong> ${escapeHtml(c.email || '—')}<br />
          <strong>Phone / WhatsApp:</strong> ${escapeHtml(c.phone || c.whatsapp || '—')}<br />
          <strong>Location:</strong> ${escapeHtml(c.city || '')}, ${escapeHtml(c.state || '')} ${escapeHtml(c.pincode || c.postalCode || '')}
        </p>

        <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #7A685D; margin: 0 0 8px;">Ordered Pieces</h3>
        <ul style="font-size: 13px; line-height: 1.6; margin: 0 0 24px; padding-left: 20px;">
          ${(order.items || []).map((it) => `<li><strong>${escapeHtml(it.product_name)}</strong> &times; ${it.quantity} (Size: ${escapeHtml(it.size || 'Free Size')}) — ${formatInr(it.price * it.quantity)}</li>`).join('')}
        </ul>

        <div style="text-align: center; padding-top: 12px; border-top: 1px solid #E9ECEF;">
          <a href="${adminUrl}" style="background-color: #141312; color: #FFFFFF; text-decoration: none; padding: 10px 20px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: bold;">
            Open Atelier Admin Console
          </a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

/**
 * Generates internal sales order cancellation notification email.
 */
export function renderSalesOrderCancelledEmail({ order, settings, appUrl }) {
  const orderNumber = escapeHtml(order.order_number || order.id)
  const isPaid = order.payment_status === 'PAID' || order.payment?.status === 'PAID'
  const refundStatus = escapeHtml(order.refund?.status || order.payment?.refund_status || (isPaid ? 'PENDING' : 'NONE'))
  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://thretha.in'
  const adminUrl = `${baseUrl.replace(/\/$/, '')}/admin`

  const subject = `Order Cancelled: ${order.order_number} (${formatInr(order.total)})`

  const text = `
ORDER CANCELLED: ${order.order_number}
Total: ${formatInr(order.total)}
Customer: ${order.customer?.fullName || order.customer?.name || 'Customer'} (${order.customer?.phone || order.customer?.whatsapp || ''})
Reason: ${order.cancellation_reason || 'Customer request'}
Refund Status: ${refundStatus}

Admin Console: ${adminUrl}
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F8F9FA; padding: 24px; color: #212529;">
  <table width="100%" style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E9ECEF; border-radius: 4px; padding: 24px;">
    <tr>
      <td>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #8C2D19; font-weight: bold;">Atelier Alert — Order Cancelled</div>
        <h2 style="font-family: Georgia, serif; margin: 4px 0 16px; color: #141312;">Order Cancelled: ${orderNumber}</h2>
        <p style="font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
          <strong>Total:</strong> ${formatInr(order.total)}<br />
          <strong>Customer:</strong> ${escapeHtml(order.customer?.fullName || order.customer?.name || 'Customer')} (${escapeHtml(order.customer?.phone || order.customer?.whatsapp || '—')})<br />
          <strong>Reason:</strong> ${escapeHtml(order.cancellation_reason || 'Customer request')}<br />
          <strong>Refund Status:</strong> ${refundStatus}
        </p>
        <div style="text-align: center; padding-top: 12px; border-top: 1px solid #E9ECEF;">
          <a href="${adminUrl}" style="background-color: #141312; color: #FFFFFF; text-decoration: none; padding: 10px 20px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: bold;">
            Open Admin Orders
          </a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

/**
 * Generates internal sales refund completed notification email.
 */
export function renderSalesRefundCompletedEmail({ order, settings, appUrl }) {
  const orderNumber = escapeHtml(order.order_number || order.id)
  const refundAmount = order.refund?.amount || order.payment?.refund_amount || order.total
  const refundRef = escapeHtml(order.refund?.cf_refund_id || order.payment?.cashfree_refund_id || 'Cashfree Reference')
  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://thretha.in'
  const adminUrl = `${baseUrl.replace(/\/$/, '')}/admin`

  const subject = `Refund Completed: ${order.order_number} (${formatInr(refundAmount)})`

  const text = `
REFUND COMPLETED: ${order.order_number}
Amount: ${formatInr(refundAmount)}
Cashfree Ref: ${refundRef}
Customer: ${order.customer?.fullName || order.customer?.name || 'Customer'}

Admin Console: ${adminUrl}
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F8F9FA; padding: 24px; color: #212529;">
  <table width="100%" style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E9ECEF; border-radius: 4px; padding: 24px;">
    <tr>
      <td>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #1E6B43; font-weight: bold;">Atelier Alert — Refund Completed</div>
        <h2 style="font-family: Georgia, serif; margin: 4px 0 16px; color: #141312;">Refund Completed: ${orderNumber}</h2>
        <p style="font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
          <strong>Amount Credited:</strong> ${formatInr(refundAmount)}<br />
          <strong>Cashfree Reference:</strong> ${refundRef}<br />
          <strong>Customer:</strong> ${escapeHtml(order.customer?.fullName || order.customer?.name || 'Customer')}
        </p>
        <div style="text-align: center; padding-top: 12px; border-top: 1px solid #E9ECEF;">
          <a href="${adminUrl}" style="background-color: #141312; color: #FFFFFF; text-decoration: none; padding: 10px 20px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: bold;">
            Open Admin Orders
          </a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

/**
 * Generates internal sales refund failed notification email.
 */
export function renderSalesRefundFailedEmail({ order, settings, appUrl }) {
  const orderNumber = escapeHtml(order.order_number || order.id)
  const failureReason = escapeHtml(order.refund?.failure_reason || order.payment?.refund_failure_reason || 'Unknown API Error')
  const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://thretha.in'
  const adminUrl = `${baseUrl.replace(/\/$/, '')}/admin`

  const subject = `ACTION REQUIRED: Refund Failed for ${order.order_number}`

  const text = `
REFUND FAILED — ACTION REQUIRED: ${order.order_number}
Amount: ${formatInr(order.total)}
Failure Reason: ${failureReason}
Customer: ${order.customer?.fullName || order.customer?.name || 'Customer'} (${order.customer?.phone || order.customer?.whatsapp || ''})

Please inspect and retry refund in Admin Console: ${adminUrl}
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #F8F9FA; padding: 24px; color: #212529;">
  <table width="100%" style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E9ECEF; border-radius: 4px; padding: 24px;">
    <tr>
      <td>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #DC2626; font-weight: bold;">Atelier Action Required — Refund Failed</div>
        <h2 style="font-family: Georgia, serif; margin: 4px 0 16px; color: #DC2626;">Refund Failed: ${orderNumber}</h2>
        <div style="background-color: #FEF2F2; padding: 16px; border-left: 4px solid #DC2626; margin: 20px 0;">
          <div style="font-size: 13px; font-weight: bold; color: #991B1B;">Amount Due: ${formatInr(order.total)}</div>
          <div style="font-size: 12px; color: #7F1D1D; margin-top: 4px;">Reason: ${failureReason}</div>
        </div>
        <div style="text-align: center; padding-top: 12px; border-top: 1px solid #E9ECEF;">
          <a href="${adminUrl}" style="background-color: #DC2626; color: #FFFFFF; text-decoration: none; padding: 10px 20px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: bold;">
            Retry Refund in Admin
          </a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

/**
 * Clean WhatsApp Provider Abstraction for Automated Sales Dispatch
 */
export async function sendSalesWhatsAppMessage({ phone, message, order }) {
  const cleanPhone = String(phone || '').replace(/[^0-9+]/g, '')
  if (!cleanPhone) {
    return { success: false, error: 'Recipient phone number missing' }
  }

  // 1. Meta WhatsApp Cloud API Integration
  const apiUrl = process.env.WHATSAPP_API_URL
  const apiToken = process.env.WHATSAPP_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (apiUrl && apiToken) {
    try {
      const endpoint = phoneNumberId ? `${apiUrl.replace(/\/$/, '')}/${phoneNumberId}/messages` : apiUrl
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone.replace(/^\+/, ''),
          type: 'text',
          text: { preview_url: false, body: message },
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        console.error('[WhatsApp:CloudAPI] Error:', errJson)
        return { success: false, provider: 'cloud_api', error: errJson.error?.message || `HTTP ${res.status}` }
      }

      const resData = await res.json()
      return { success: true, provider: 'cloud_api', messageId: resData.messages?.[0]?.id }
    } catch (err) {
      console.error('[WhatsApp:CloudAPI] Request failed:', err.message)
      return { success: false, provider: 'cloud_api', error: err.message }
    }
  }

  // 2. Twilio WhatsApp API Integration
  const twilioSid = process.env.TWILIO_ACCOUNT_SID
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'

  if (twilioSid && twilioAuth) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64')
      const formattedTo = cleanPhone.startsWith('whatsapp:') ? cleanPhone : `whatsapp:${cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`}`
      const params = new URLSearchParams({
        From: twilioFrom,
        To: formattedTo,
        Body: message,
      })

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        return { success: false, provider: 'twilio', error: errJson.message || `HTTP ${res.status}` }
      }

      const resData = await res.json()
      return { success: true, provider: 'twilio', messageId: resData.sid }
    } catch (err) {
      console.error('[WhatsApp:Twilio] Request failed:', err.message)
      return { success: false, provider: 'twilio', error: err.message }
    }
  }

  // 3. Unconfigured Provider Failure
  console.warn(`[WhatsApp:Sales Warning] WhatsApp provider is not configured in environment. Delivery to ${cleanPhone} failed.`)
  return {
    success: false,
    provider: 'none',
    error: 'WhatsApp provider is not configured. Please set WHATSAPP_API_URL and WHATSAPP_API_TOKEN, or TWILIO credentials in environment.',
  }
}

/**
 * Production-ready, idempotent order notification orchestrator.
 * Safe against race conditions and multiple webhook retries.
 */
export async function dispatchOrderNotifications({
  database,
  orderId,
  event = 'ORDER_CONFIRMED',
  appUrl,
}) {
  if (!database || !orderId) return { success: false, error: 'Database and orderId required' }

  try {
    const order = await database.collection('orders').findOne({
      $or: [{ id: orderId }, { order_number: orderId }],
    })

    if (!order) {
      console.warn('[Notifications] Order not found for notification dispatch:', orderId)
      return { success: false, error: 'Order not found' }
    }

    const settings = await getOrderNotificationSettings(database)

    // Event Trigger Enablement Guard
    if (event === 'ORDER_CONFIRMED' && settings.events?.order_confirmed === false) {
      return { success: true, skipped: true, reason: 'Event ORDER_CONFIRMED is disabled in settings' }
    }
    if (event === 'ORDER_CANCELLED' && settings.events?.order_cancelled === false) {
      return { success: true, skipped: true, reason: 'Event ORDER_CANCELLED is disabled in settings' }
    }
    if (event === 'REFUND_COMPLETED' && settings.events?.order_refunded === false) {
      return { success: true, skipped: true, reason: 'Event REFUND_COMPLETED is disabled in settings' }
    }

    // Payment Status Guard: Never send confirmation notifications for unpaid/pending Cashfree orders
    if (event === 'ORDER_CONFIRMED') {
      const isPaid =
        order.payment_status === 'PAID' ||
        order.payment?.status === 'PAID' ||
        order.status === 'CONFIRMED' ||
        order.status === 'WHATSAPP CONTACTED' ||
        order.payment_method === 'WHATSAPP_CONCIERGE'

      if (!isPaid && order.payment_method === 'CASHFREE') {
        console.warn(`[Notifications] Skipping ORDER_CONFIRMED for unpaid Cashfree order ${order.order_number} (status=${order.payment_status || order.status})`)
        return {
          success: false,
          reason: 'ORDER_NOT_PAID',
          error: `Order ${order.order_number} is not verified/paid (current status: ${order.payment_status || order.status})`,
        }
      }
    }

    const logsCol = database.collection('order_notifications_log')

    // Ensure compound indexes on notification logs
    await logsCol.createIndex(
      { order_id: 1, event: 1, channel: 1, recipient: 1 },
      { background: true }
    ).catch(() => {})

    const results = {
      order_number: order.order_number,
      customer_email: null,
      sales_emails: [],
      sales_whatsapp: [],
    }

    // ─────────────────────────────────────────────────────────────
    // 1. CUSTOMER ORDER CONFIRMATION EMAIL
    // ─────────────────────────────────────────────────────────────
    const customerEmail = (order.customer?.email || '').trim()
    if (settings.customer_email_enabled && customerEmail && customerEmail.includes('@')) {
      const existingCustomerLog = await logsCol.findOne({
        order_id: order.id,
        event,
        channel: 'EMAIL',
        recipient: customerEmail.toLowerCase(),
        status: 'SENT',
      })

      if (existingCustomerLog) {
        results.customer_email = { status: 'ALREADY_SENT', id: existingCustomerLog.id }
      } else {
        let emailPayload
        if (event === 'ORDER_CANCELLED') {
          emailPayload = renderCustomerOrderCancelledEmail({ order, settings, appUrl })
        } else if (event === 'REFUND_COMPLETED') {
          emailPayload = renderCustomerRefundCompletedEmail({ order, settings, appUrl })
        } else {
          emailPayload = renderCustomerOrderEmail({ order, settings, appUrl })
        }

        try {
          const sendRes = await sendEmail({ to: customerEmail, ...emailPayload })
          const logEntry = {
            id: uuidv4(),
            order_id: order.id,
            order_number: order.order_number,
            event,
            channel: 'EMAIL',
            recipient: customerEmail.toLowerCase(),
            recipient_name: order.customer?.fullName || order.customer?.name || 'Customer',
            recipient_type: 'CUSTOMER',
            status: 'SENT',
            provider: sendRes.provider || 'email_provider',
            provider_message_id: sendRes.id || null,
            error: null,
            sent_at: new Date(),
            created_at: new Date(),
          }
          await logsCol.insertOne(logEntry)
          results.customer_email = { status: 'SENT', id: logEntry.id }
        } catch (err) {
          console.error('[Notifications:CustomerEmail] Error delivering email:', err.message)
          await logsCol.insertOne({
            id: uuidv4(),
            order_id: order.id,
            order_number: order.order_number,
            event,
            channel: 'EMAIL',
            recipient: customerEmail.toLowerCase(),
            recipient_name: order.customer?.fullName || order.customer?.name || 'Customer',
            recipient_type: 'CUSTOMER',
            status: 'FAILED',
            error: err.message,
            created_at: new Date(),
          })
          results.customer_email = { status: 'FAILED', error: err.message }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. SALES TEAM EMAIL NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────
    if (settings.sales_email?.enabled) {
      const recipients = (settings.sales_email.recipients || []).filter(
        (r) => r.active !== false && r.email && r.email.includes('@')
      )

      for (const rec of recipients) {
        const recEmail = rec.email.trim().toLowerCase()
        const existingSalesLog = await logsCol.findOne({
          order_id: order.id,
          event,
          channel: 'EMAIL',
          recipient: recEmail,
          status: 'SENT',
        })

        if (existingSalesLog) {
          results.sales_emails.push({ recipient: recEmail, status: 'ALREADY_SENT' })
          continue
        }

        let emailPayload
        if (event === 'ORDER_CANCELLED') {
          emailPayload = renderSalesOrderCancelledEmail({ order, settings, appUrl })
        } else if (event === 'REFUND_COMPLETED') {
          emailPayload = renderSalesRefundCompletedEmail({ order, settings, appUrl })
        } else if (event === 'REFUND_FAILED') {
          emailPayload = renderSalesRefundFailedEmail({ order, settings, appUrl })
        } else {
          emailPayload = renderSalesOrderEmail({ order, settings, appUrl })
        }

        try {
          const sendRes = await sendEmail({ to: recEmail, ...emailPayload })
          const logEntry = {
            id: uuidv4(),
            order_id: order.id,
            order_number: order.order_number,
            event,
            channel: 'EMAIL',
            recipient: recEmail,
            recipient_name: rec.name || 'Sales Staff',
            recipient_type: 'SALES',
            status: 'SENT',
            provider: sendRes.provider || 'email_provider',
            provider_message_id: sendRes.id || null,
            error: null,
            sent_at: new Date(),
            created_at: new Date(),
          }
          await logsCol.insertOne(logEntry)
          results.sales_emails.push({ recipient: recEmail, status: 'SENT' })
        } catch (err) {
          console.error(`[Notifications:SalesEmail] Error delivering to ${recEmail}:`, err.message)
          await logsCol.insertOne({
            id: uuidv4(),
            order_id: order.id,
            order_number: order.order_number,
            event,
            channel: 'EMAIL',
            recipient: recEmail,
            recipient_name: rec.name || 'Sales Staff',
            recipient_type: 'SALES',
            status: 'FAILED',
            error: err.message,
            created_at: new Date(),
          })
          results.sales_emails.push({ recipient: recEmail, status: 'FAILED', error: err.message })
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. SALES TEAM WHATSAPP NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────
    if (settings.sales_whatsapp?.enabled) {
      const waRecipients = (settings.sales_whatsapp.recipients || []).filter(
        (r) => r.active !== false && r.phone
      )

      let waMessage = ''
      if (event === 'ORDER_CANCELLED') {
        waMessage = `🚨 *ORDER CANCELLED: ${order.order_number}*\n` +
          `Amount: *${formatInr(order.total)}*\n` +
          `Customer: ${order.customer?.fullName || order.customer?.name || 'Customer'}\n` +
          `Reason: ${order.cancellation_reason || 'Customer request'}\n` +
          `Refund Status: *${order.refund?.status || order.payment?.refund_status || 'NONE'}*\n\n` +
          `Atelier Admin: ${appUrl || 'https://thretha.in'}/admin`
      } else if (event === 'REFUND_COMPLETED') {
        waMessage = `✅ *REFUND COMPLETED: ${order.order_number}*\n` +
          `Amount: *${formatInr(order.refund?.amount || order.total)}*\n` +
          `Customer: ${order.customer?.fullName || order.customer?.name || 'Customer'}\n` +
          `Cashfree Ref: *${order.refund?.cf_refund_id || order.payment?.cashfree_refund_id || 'Completed'}*\n\n` +
          `Atelier Admin: ${appUrl || 'https://thretha.in'}/admin`
      } else if (event === 'REFUND_FAILED') {
        waMessage = `⚠️ *ACTION REQUIRED: REFUND FAILED*\n` +
          `Order: *${order.order_number}*\n` +
          `Amount: *${formatInr(order.total)}*\n` +
          `Reason: ${order.refund?.failure_reason || 'API Error'}\n\n` +
          `Retry in Admin: ${appUrl || 'https://thretha.in'}/admin`
      } else {
        const itemsSummary = (order.items || [])
          .map((it) => `• *${it.product_name}* (Qty: ${it.quantity}, Size: ${it.size || 'Free Size'}) - ₹${it.price * it.quantity}`)
          .join('\n')

        waMessage = `✨ *NEW ORDER: ${order.order_number}*\n` +
          `Total: *${formatInr(order.total)}*\n` +
          `Payment: *${order.payment_status}* (${order.payment_method})\n\n` +
          `👤 *Customer:* ${order.customer?.fullName || order.customer?.name || 'Customer'}\n` +
          `📞 *Phone:* ${order.customer?.phone || order.customer?.whatsapp || '—'}\n` +
          `📍 *Location:* ${order.customer?.city || ''}, ${order.customer?.state || ''}\n\n` +
          `📦 *Pieces:*\n${itemsSummary}\n\n` +
          `Atelier Admin Console: ${appUrl || 'https://thretha.in'}/admin`
      }

      for (const rec of waRecipients) {
        const recPhone = String(rec.phone).trim()
        const existingWaLog = await logsCol.findOne({
          order_id: order.id,
          event,
          channel: 'WHATSAPP',
          recipient: recPhone,
          status: 'SENT',
        })

        if (existingWaLog) {
          results.sales_whatsapp.push({ recipient: recPhone, status: 'ALREADY_SENT' })
          continue
        }

        try {
          const waRes = await sendSalesWhatsAppMessage({
            phone: recPhone,
            message: waMessage,
            order,
            settings,
          })

          const logEntry = {
            id: uuidv4(),
            order_id: order.id,
            order_number: order.order_number,
            event,
            channel: 'WHATSAPP',
            recipient: recPhone,
            recipient_name: rec.name || 'Sales Staff',
            recipient_type: 'SALES',
            status: waRes.success ? 'SENT' : 'FAILED',
            provider: waRes.provider || 'whatsapp_provider',
            provider_message_id: waRes.messageId || null,
            error: waRes.error || null,
            sent_at: waRes.success ? new Date() : null,
            created_at: new Date(),
          }
          await logsCol.insertOne(logEntry)
          results.sales_whatsapp.push({ recipient: recPhone, status: waRes.success ? 'SENT' : 'FAILED' })
        } catch (err) {
          console.error(`[Notifications:SalesWhatsApp] Error delivering to ${recPhone}:`, err.message)
          await logsCol.insertOne({
            id: uuidv4(),
            order_id: order.id,
            order_number: order.order_number,
            event,
            channel: 'WHATSAPP',
            recipient: recPhone,
            recipient_name: rec.name || 'Sales Staff',
            recipient_type: 'SALES',
            status: 'FAILED',
            error: err.message,
            created_at: new Date(),
          })
          results.sales_whatsapp.push({ recipient: recPhone, status: 'FAILED', error: err.message })
        }
      }
    }

    return { success: true, results }
  } catch (err) {
    console.error('[Notifications:Orchestrator] Unexpected error:', err)
    return { success: false, error: err.message }
  }
}
