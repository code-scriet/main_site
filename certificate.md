# Certificate System — Logic & Issues Audit

**Updated:** 2026-03-13
**Scope:** How signatures work, what's stored, what's broken, what's missing.

---

## How the System Actually Works

### The Full Request → PDF Flow

```
Admin fills form
  → POST /api/certificates/generate
      { recipientName, recipientEmail, eventName, type, signatoryId, facultySignatoryId, ... }
  → Zod validates input
  → sanitizeText() runs on each text field
  → Signatory records fetched from DB (name, title, signatureUrl)
  → Signature images fetched as base64 from Cloudinary for PDF embedding
  → generateCertificatePDF(data) renders PDF in memory via @react-pdf/renderer
  → uploadCertificate() stores PDF: R2 → Cloudinary → local disk (fallback chain)
  → prisma.certificate.create() saves to DB (with denormalized signatory snapshot)
  → optional: emailService.sendCertificateIssued()
```

### How Signatures Work

Signatures can be **real images** or **cursive-font text fallback**:

```
Primary path (Signatory record with image):
  signatoryRecord.signatureUrl → resolveSignatureBase64() → base64 PNG
  PDF renders: Image (transparent PNG) + line + name in Cinzel + title in Cormorant

Fallback (no image uploaded):
  signatoryName text → Great Vibes cursive font
  PDF renders: "Aarav Mehta" in Great Vibes + line + "AARAV MEHTA" in Cinzel + title
```

Signature images are uploaded to Cloudinary at `signatories/sig-{id}` via `POST /api/signatories`.
The `Signatory` model stores `signatureUrl` (Cloudinary URL or data URI).

At certificate generation time, signatory info is **denormalized** onto the Certificate record
(`signatoryName`, `signatoryTitle`, `signatoryImageUrl`) so historical certs remain reproducible
even if the Signatory record changes or is deleted.

### How Logos Are Loaded

Both logos are pre-loaded from disk **once at server startup**, converted to base64 data URIs, and held in memory:

```typescript
const CODESCRIET_LOGO = loadLogoBase64('codescriet.png') ?? loadLogoBase64('codescriet.jpg') ?? ...
const CCSU_LOGO       = loadLogoBase64('ccsu.png') ?? loadLogoBase64('ccsu.jpg') ?? ...
```

If the logo files don't exist when the server starts, the logos are silently `undefined` and simply omitted from the certificate. No error is thrown.

---

## Issues — Status

### ✅ 1. `signatoryName` Default Was a Title, Not a Name — FIXED

**Was:** `signatoryName: z.string().max(100).default('Club President')` — the default rendered as the signature text.

**Fix:** The system now uses `Signatory` DB records. `signatoryId` resolves to a real person's name and image. The text fallback (`signatoryName` field) is optional and clearly labelled. The default `'Club President'` is only used if neither `signatoryId` nor `signatoryName` is provided — which is a configuration error, not a silent bad default.

### ✅ 2. `signatoryName`/`facultyName` Never Saved to DB — FIXED

**Was:** Names used for PDF render were discarded; re-rendering was impossible.

**Fix:** `Certificate` model now stores a full snapshot: `signatoryName`, `signatoryTitle`, `signatoryImageUrl`, `facultyName`, `facultyTitle`, `facultySignatoryImageUrl`. Historical accuracy preserved.

### ✅ 3. `domain` Missing from Bulk Schema — FIXED

**Was:** `/bulk` endpoint didn't accept `domain`; bulk WINNER certs couldn't have a domain.

**Fix:** `domain` added to `bulkSchema` and bulk `prisma.certificate.create()`.

### ✅ 4. Bulk Generation Had No `certId` Collision Check — FIXED

**Was:** `const certId = generateCertId()` with no retry; Prisma unique constraint crash → recipient silently lands in `failures`.

**Fix:** Bulk handler now has a 5-attempt retry loop identical to the single generate handler. Collision → new ID generated. Exhausted retries → explicit failure entry with reason.

### ✅ 5. Single Generate Collision Retry Was Confusing — FIXED

**Was:** While loop + redundant 6th `findUnique` call after loop exit; logic unclear.

**Fix:** Replaced with a clean `for` loop that checks the current ID, breaks if free, regenerates if collision, returns error if all 5 attempts exhausted.

### ✅ 6. `PlayfairDisplay-Bold.ttf` Not in Git — FIXED

**Was:** File downloaded locally, not committed — would be missing on Render deployment, silently breaking recipient name typography.

**Fix:** File committed to git at `apps/api/public/logos/PlayfairDisplay-Bold.ttf`.

### ⚠️ 7. `template` Field Is Accepted and Stored But Does Nothing

**File:** `generateCertificatePDF.ts`

The admin can choose `gold | dark | white | emerald` template. The Zod schema validates it, the DB stores it, the frontend shows template-aware colors in user dashboard cards. But `generateCertificatePDF()` ignores the `template` parameter — every certificate renders the same design.

**Status:** Known limitation. Implementing four distinct PDF designs requires significant effort. The field is stored for when this is implemented.

### ✅ 8. `qrCodeUrl` Dead Column — FIXED (prior)

Column removed from schema. QR code is generated as a data URL and embedded directly in the PDF.

### ✅ 9. `description` Not Saved in Bulk — FIXED (prior)

Both single and bulk generation now save `description` to the DB.

### ✅ 10. Bulk Email Failures Not Surfaced — FIXED

**Was:** Email sending was fire-and-forget; admin saw "Generated 50/50" with no email delivery info.

**Fix:** Bulk handler now awaits email sending per recipient, tracks `emailsSent` and `emailsFailed` counts, and includes them in the API response when `sendEmail: true`.

### ✅ 11. `CORE_MEMBER` Could Download Any Certificate — FIXED

**Was:** `['ADMIN', 'CORE_MEMBER'].includes(authUser.role)` — inconsistent with all other cert endpoints requiring ADMIN level.

**Fix:** Changed to `['ADMIN', 'PRESIDENT'].includes(authUser.role)` — aligns with `requireRole('ADMIN')` used everywhere else.

### ⚠️ 12. Verify Endpoint Exposes `pdfUrl` Publicly

**File:** `certificates.ts` — `GET /verify/:certId`

The public verification endpoint returns `pdfUrl` directly. Anyone can call `/api/certificates/verify/:certId` to get a direct Cloudinary/storage link without authenticating.

**Status:** Probably intentional (public certs should be verifiable and downloadable). Worth making explicit in any future API documentation.

---

## What's in the DB

| Field | DB Column | Notes |
|-------|-----------|-------|
| `signatoryName` | ✅ `signatory_name` | Denormalized snapshot at generation time |
| `signatoryTitle` | ✅ `signatory_title` | Denormalized snapshot |
| `signatoryImageUrl` | ✅ `signatory_image_url` | Cloudinary URL of signature image |
| `facultyName` | ✅ `faculty_name` | Denormalized snapshot |
| `facultyTitle` | ✅ `faculty_title` | Denormalized snapshot |
| `facultySignatoryImageUrl` | ✅ `faculty_signatory_image_url` | Cloudinary URL |
| `domain` (bulk) | ✅ `domain` | Now saved in bulk generation |
| Email delivery status | ✅ `emailSent`, `emailSentAt` | Per-certificate tracking |

---

## What's Not Possible That Should Be

| Operation | Why Not Possible |
|-----------|-----------------|
| Four distinct PDF designs | `generateCertificatePDF` ignores `template` param |
| Preview PDF before generating | No preview endpoint; must generate to see |
| Link certs to events from admin form | Form has no event picker despite API support |
| Auto-generate certs when event ends | No scheduler integration |
