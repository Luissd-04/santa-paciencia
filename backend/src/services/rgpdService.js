const { db } = require('../config/database');

function generateRgpdDocument(guest, reservation) {
  const date = new Date().toLocaleDateString('pt-PT', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return {
    html: `
      <div style="font-family:Georgia,serif;max-width:700px;margin:0 auto;padding:30px;">
        <h1 style="text-align:center;color:#2c3e50;">Santa Paciência — Alojamento Local</h1>
        <h2 style="text-align:center;color:#666;font-size:16px;">
          DECLARAÇÃO DE CONSENTIMENTO RGPD
        </h2>
        <hr/>
        <p>Em cumprimento do Regulamento Geral de Proteção de Dados (RGPD — 
        Regulamento EU 2016/679), informamos que os seus dados pessoais serão 
        tratados para os seguintes fins:</p>
        <ul>
          <li>Gestão da reserva e check-in/check-out</li>
          <li>Comunicações relacionadas com a sua estadia</li>
          <li>Cumprimento de obrigações legais (SEF/AIMA, autoridades fiscais)</li>
          <li>Faturação e contabilidade</li>
        </ul>
        <p><strong>Responsável pelo tratamento:</strong> ${process.env.PROPERTY_NAME}<br/>
        <strong>Contacto:</strong> ${process.env.EMAIL_USER}</p>
        <p>Os seus dados não serão partilhados com terceiros exceto para cumprimento 
        de obrigações legais. Pode solicitar acesso, retificação ou apagamento dos 
        seus dados através do email acima.</p>
        <hr/>
        <table width="100%" style="margin-top:20px;">
          <tr>
            <td><strong>Nome:</strong> ${guest.name}</td>
            <td><strong>Data:</strong> ${date}</td>
          </tr>
          <tr>
            <td><strong>Reserva:</strong> ${reservation.id}</td>
            <td><strong>Alojamento:</strong> ${process.env.LICENSE_NUMBER}</td>
          </tr>
        </table>
        <div style="margin-top:40px;padding:15px;background:#f9f9f9;border:1px solid #ddd;
                    border-radius:4px;text-align:center;">
          ✅ <strong>Consentimento registado digitalmente em ${date}</strong>
        </div>
      </div>
    `,
    text: `Consentimento RGPD registado para ${guest.name} — Reserva ${reservation.id} — ${date}`
  };
}

function recordConsent(guestId, ip) {
  db.prepare(`
    UPDATE guests 
    SET rgpd_consent = 1, 
        rgpd_consent_date = datetime('now'), 
        rgpd_consent_ip = ?
    WHERE id = ?
  `).run(ip, guestId);
}

module.exports = { generateRgpdDocument, recordConsent };