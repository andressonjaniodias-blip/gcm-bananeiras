// Envio de e-mail via API da Brevo (https://api.brevo.com/v3/smtp/email)
async function enviarEmail({ to, toName, subject, html, attachments }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY não configurada.');

  const from = process.env.SMTP_FROM || 'GCM Bananeiras <noreply@gcm-bananeiras.onrender.com>';
  const [fromName, fromEmail] = from.includes('<')
    ? [from.split('<')[0].trim(), from.split('<')[1].replace('>', '').trim()]
    : ['GCM Bananeiras', from];

  const body = {
    sender: { name: fromName, email: fromEmail },
    to: [{ email: to, name: toName || to }],
    subject,
    htmlContent: html,
  };
  if (attachments && attachments.length) {
    body.attachment = attachments.map(a => ({ content: a.content, name: a.name }));
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo API error: ${err}`);
  }
}

// Envia um PDF gerado automaticamente para o e-mail de notificação configurado.
// Fire-and-forget: nunca deve derrubar o fluxo principal que o chamou.
// onError (opcional): callback chamado em caso de falha no envio — usado para
// registrar a falha na trilha de auditoria (a trilha tem peso legal).
function enviarPdfNotificacao({ subject, html, pdfBuffer, filename, onError }) {
  const to = process.env.NOTIFICACAO_PDF_EMAIL;
  if (!to) {
    console.error('[Email-PDF] NOTIFICACAO_PDF_EMAIL não configurado — envio ignorado.');
    return;
  }
  enviarEmail({
    to,
    subject,
    html,
    attachments: [{ content: pdfBuffer.toString('base64'), name: filename }],
  }).catch(err => {
    console.error(`[Email-PDF] Falha ao enviar "${filename}":`, err.message);
    if (typeof onError === 'function') {
      try { onError(err); } catch (_) { /* auditoria best-effort */ }
    }
  });
}

module.exports = { enviarEmail, enviarPdfNotificacao };
