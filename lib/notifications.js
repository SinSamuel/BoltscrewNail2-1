/**
 * Helper to dispatch instant notifications across Discord, Telegram, and Resend
 * when a customer places an order on BoltScrewNail.
 */

export async function sendOrderNotifications(order) {
    const {
        invoiceId,
        customer = {},
        delivery = {},
        confirm = 'call',
        items = [],
        subtotal = 0,
        discounts = [],
        discountTotal = 0,
        tax = 0,
        total = 0
    } = order;

    const custName = customer.name || 'Customer';
    const custEmail = customer.email || 'N/A';
    const custPhone = customer.phone || 'N/A';
    const custCompany = customer.company || 'N/A';

    const deliveryAddress = delivery.address || 'N/A';
    const deliveryContact = delivery.contact || custName;
    const deliveryPhone = delivery.phone || custPhone;

    const confirmLabel = confirm === 'call' ? '📞 PHONE CALL' : confirm === 'text' ? '💬 TEXT MESSAGE' : '✉️ EMAIL';

    const discountSummaryText = discounts && discounts.length > 0
        ? `\n\n**🏷️ DISCOUNTS APPLIED:**\n${discounts.map(d => `• ${d.label}: -$${d.amount.toFixed(2)}`).join('\n')}\n**SAVINGS:** -$${discountTotal.toFixed(2)}`
        : '';

    // Outliner response templates for shop owner
    const textTemplate = `Hi ${custName}! This is BoltScrewNail. We've received your order #${invoiceId} ($${total.toFixed(2)}). Your estimated delivery window is 2-4 hours. Reply YES to confirm!`;
    const callOutline = `Call ${custPhone} → "Hi ${custName}, confirming your weekend delivery to ${deliveryAddress}. Order Total: $${total.toFixed(2)}."`;

    // 1. Discord Webhook Notification
    if (process.env.DISCORD_WEBHOOK_URL) {
        try {
            const itemLines = items.map(it => `• **${it.qty}x** ${it.name} — $${it.total.toFixed(2)}`).join('\n') || 'Items listed on invoice';

            await fetch(process.env.DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: 'BoltScrewNail Orders',
                    avatar_url: 'https://boltscrewnail2-2.vercel.app/favicon-32.png',
                    embeds: [{
                        title: `🚨 NEW ORDER — Invoice #${invoiceId}`,
                        color: 16744448, // Industrial Amber
                        fields: [
                            {
                                name: '👤 CUSTOMER DETAILS',
                                value: `**Name:** ${custName}\n**Company:** ${custCompany}\n**Email:** ${custEmail}\n**Phone:** [${custPhone}](tel:${custPhone.replace(/\D/g, '')})`,
                                inline: true
                            },
                            {
                                name: '🚚 DELIVERY ADDRESS',
                                value: `**Contact:** ${deliveryContact}\n**Phone:** [${deliveryPhone}](tel:${deliveryPhone.replace(/\D/g, '')})\n**Address:** ${deliveryAddress}`,
                                inline: true
                            },
                            {
                                name: '🎯 PREFERRED CONFIRMATION METHOD',
                                value: `**${confirmLabel}**`,
                                inline: false
                            },
                            {
                                name: '🛒 ORDER ITEMS',
                                value: `${itemLines}${discountSummaryText}\n\n**SUBTOTAL:** $${subtotal.toFixed(2)}\n**TAX (7%):** $${tax.toFixed(2)}\n**TOTAL:** $${total.toFixed(2)}`,
                                inline: false
                            },
                            {
                                name: '📱 QUICK RESPONSE TEMPLATE (COPY/PASTE)',
                                value: `\`\`\`\n${textTemplate}\n\`\`\``,
                                inline: false
                            }
                        ],
                        footer: { text: 'BoltScrewNail Order Dispatch System' },
                        timestamp: new Date().toISOString()
                    }]
                })
            });
        } catch (e) {
            console.error('[notifications] Discord webhook failed:', e);
        }
    }

    // 2. Telegram Bot Notification
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        try {
            const itemLinesTg = items.map(it => `• *${it.qty}x* ${it.name} — $${it.total.toFixed(2)}`).join('\n');
            const tgMsg = `🚨 *NEW ORDER — Invoice #${invoiceId}*\n\n` +
                `👤 *Customer:* ${custName} (${custCompany})\n` +
                `📞 *Phone:* ${custPhone}\n` +
                `✉️ *Email:* ${custEmail}\n\n` +
                `🚚 *Delivery:* ${deliveryAddress}\n` +
                `👤 *Contact:* ${deliveryContact} (${deliveryPhone})\n\n` +
                `🎯 *Preferred Contact:* ${confirmLabel}\n\n` +
                `🛒 *Items:*\n${itemLinesTg}\n\n` +
                `*TOTAL:* $${total.toFixed(2)}\n\n` +
                `📱 *Quick Response Template:*\n\`${textTemplate}\``;

            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: process.env.TELEGRAM_CHAT_ID,
                    text: tgMsg,
                    parse_mode: 'Markdown'
                })
            });
        } catch (e) {
            console.error('[notifications] Telegram notification failed:', e);
        }
    }

    // 3. Resend Email Confirmation (Customer + Admin)
    if (process.env.RESEND_API_KEY) {
        try {
            const adminEmail = process.env.ADMIN_EMAIL || 'orders@boltscrewnail.com';
            const itemHtml = items.map(it => `<tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${it.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${it.qty}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${it.total.toFixed(2)}</td>
            </tr>`).join('');

            const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
                <div style="background: #000; padding: 20px; text-align: center;">
                    <h1 style="color: #fff; margin: 0; font-size: 24px; letter-spacing: 2px;">BOLTSCREWNAIL</h1>
                    <p style="color: #888; margin: 5px 0 0; font-weight: bold;">ORDER CONFIRMATION</p>
                </div>
                <div style="padding: 30px; border: 1px solid #eee;">
                    <h2 style="margin-top: 0;">Hi ${custName},</h2>
                    <p>Thank you for your order! We have received your request and our Raleigh dispatch team is preparing your delivery details.</p>

                    <div style="background: #f9f9f9; padding: 15px; margin: 20px 0; border-left: 4px solid #000;">
                        <p style="margin: 0 0 5px;"><strong>Order ID:</strong> #${invoiceId}</p>
                        <p style="margin: 0 0 5px;"><strong>Delivery Address:</strong> ${deliveryAddress}</p>
                        <p style="margin: 0;"><strong>Confirmation Method:</strong> ${confirmLabel}</p>
                    </div>

                    <h3>Order Summary</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #000; color: #fff;">
                                <th style="padding: 10px; text-align: left;">Item</th>
                                <th style="padding: 10px; text-align: center;">Qty</th>
                                <th style="padding: 10px; text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemHtml}
                        </tbody>
                    </table>

                    <div style="text-align: right; margin-top: 20px;">
                        <p style="margin: 5px 0;">Subtotal: $${subtotal.toFixed(2)}</p>
                        <p style="margin: 5px 0;">NC Sales Tax (7%): $${tax.toFixed(2)}</p>
                        <h2 style="margin: 10px 0 0; font-size: 24px;">Total: $${total.toFixed(2)}</h2>
                    </div>

                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                    <p style="font-size: 12px; color: #666; text-align: center;">BoltScrewNail • Weekend Job-Site Delivery • Raleigh, NC</p>
                </div>
            </div>`;

            // Email to Customer
            await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'BoltScrewNail <orders@boltscrewnail.com>',
                    to: [custEmail],
                    subject: `Order Confirmation #${invoiceId} — BoltScrewNail`,
                    html: emailHtml
                })
            });

            // Email to Shop Owner (Admin)
            if (adminEmail && adminEmail !== custEmail) {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: 'BoltScrewNail Orders <orders@boltscrewnail.com>',
                        to: [adminEmail],
                        subject: `🚨 NEW ORDER ALERT #${invoiceId} — $${total.toFixed(2)}`,
                        html: emailHtml
                    })
                });
            }
        } catch (e) {
            console.error('[notifications] Resend email failed:', e);
        }
    }
}
