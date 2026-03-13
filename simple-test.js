import React from 'react';
import { Document, Page, View, Text, Font, renderToBuffer } from '@react-pdf/renderer';
import fs from 'fs';

Font.register({
  family: 'Great Vibes',
  src: '/Users/lakshya/Developement/Projects/Web/club_site/apps/api/public/logos/GreatVibes.ttf'
});

async function main() {
  const doc = React.createElement(Document, null,
    React.createElement(Page, null,
      React.createElement(View, null,
        React.createElement(Text, { style: { fontFamily: 'Great Vibes' } }, "TEST"),
        React.createElement(Text, { style: { fontFamily: 'Great Vibes', fontWeight: 400 } }, "TEST2")
      )
    )
  );
  try {
    const buffer = await renderToBuffer(doc);
    fs.writeFileSync('/tmp/simple-test.pdf', buffer);
    console.log('Done');
  } catch (err) {
    console.error(err);
  }
}
main();
