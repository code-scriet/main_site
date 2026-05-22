import { generateCertificatePDF } from '../../apps/api/dist/utils/generateCertificatePDF.js';
import fs from 'fs';

async function main() {
  try {
    const pdf = await generateCertificatePDF({
      recipientName: 'Lakshya Pandey',
      eventName: 'Hackathon',
      type: 'WINNER',
      position: 'First Place',
      certId: 'TEST-1234',
      issuedAt: new Date('2026-03-13T00:00:00Z'),
      signatoryName: 'TEST',
      facultyName: 'TEST',
    });
    fs.writeFileSync('/tmp/out.pdf', pdf);
    console.log('PDF generated at /tmp/out.pdf');
  } catch (err) {
    console.error(err);
  }
}

main();
