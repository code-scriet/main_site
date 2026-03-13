import * as dotenv from 'dotenv';
dotenv.config();
import { cloudinary } from './src/config/cloudinary';

const certId = 'P43K-J7G2-VH7H';
const unsignedUrl = cloudinary.url(`certificates/${certId}`, { resource_type: 'raw', secure: true });
console.log('Unsigned URL:', unsignedUrl);

const signedUrl = cloudinary.url(`certificates/${certId}`, { resource_type: 'raw', secure: true, sign_url: true });
console.log('Signed URL:', signedUrl);

console.log('Sign URL w/ PDF extension:', cloudinary.url(`certificates/${certId}.pdf`, { resource_type: 'raw', secure: true, sign_url: true }));

async function testFetch(url: string, name: string) {
  try {
    const res = await fetch(url);
    console.log(`${name} fetch status:`, res.status);
  } catch (err: any) {
    console.log(`${name} fetch error:`, err.message);
  }
}

testFetch(unsignedUrl, 'unsigned').then(() => testFetch(signedUrl, 'signed'));
