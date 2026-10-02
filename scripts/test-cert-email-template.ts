/* Temp script: render the custom certificate email without Brevo/Cloudinary */
import { emailService } from '../apps/api/src/utils/email.js';
import fs from 'node:fs';

const sent: any[] = [];
(emailService as any).send = async (opts: any) => {
  sent.push(opts);
  return true;
};

const customBody = `Hi {{name}},

Congratulations on completing {{eventName}}! Your certificate (ID: {{certId}}) is attached below.

Warm regards,
The code.scriet Team`;

async function main() {
await emailService.sendCertificateCustom({
  email: 'student@example.com',
  name: 'Aarav Sharma',
  eventName: 'HackCCSU 2026',
  certId: 'CS-TEST-0001',
  downloadUrl: 'https://example.com/certificates/CS-TEST-0001.pdf',
  customBody,
});

// Also test an HTML body variant
await emailService.sendCertificateCustom({
  email: 'student@example.com',
  name: 'Priya Verma',
  eventName: 'CodeSprint',
  certId: 'CS-TEST-0002',
  downloadUrl: 'https://example.com/certificates/CS-TEST-0002.pdf',
  customBody: '<p>Hello <b>{{name}}</b>, your <i>{{eventName}}</i> certificate is ready.</p><p><a href="{{downloadUrl}}">Get it here</a> or <a href="{{verifyUrl}}">verify it</a>.</p>',
});

fs.writeFileSync('cert-email-plain.html', `<!DOCTYPE html><html><body style="background:#111;padding:24px">${sent[0].html}</body></html>`);
fs.writeFileSync('cert-email-rich.html', `<!DOCTYPE html><html><body style="background:#111;padding:24px">${sent[1].html}</body></html>`);
console.log('SUBJECT 1:', sent[0].subject);
console.log('TEXT 1:\n', sent[0].text);
console.log('\nWrote cert-email-plain.html and cert-email-rich.html');
}

main();
