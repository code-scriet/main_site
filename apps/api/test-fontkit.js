import fs from 'fs';
import * as fontkit from 'fontkit';

const buffer = fs.readFileSync('/tmp/GreatVibes-Regular.ttf');
const font = fontkit.create(buffer);
console.log('familyName:', font.familyName);
console.log('postscriptName:', font.postscriptName);
console.log('fullName:', font.fullName);
console.log('Has glyph T:', font.hasGlyphForCodePoint('T'.charCodeAt(0)));
console.log('Has glyph a:', font.hasGlyphForCodePoint('a'.charCodeAt(0)));
