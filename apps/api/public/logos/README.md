# Certificate Logos

Place these two PNG files here (transparent background recommended):

- `codescriet.png` — CodeScriet club logo (used in certificate header top-right and as watermark)
- `ccsu.png` — CCSU (Chaudhary Charan Singh University) logo (used in certificate header top-left)

Both are displayed at 48×48 pt in the PDF header.  
The CodeScriet logo is also used as a centered watermark at 5% opacity.

The API server reads these files at startup and embeds them as base64 in every generated certificate PDF.
If either file is missing, the corresponding logo slot is left blank — certificate generation still succeeds.
