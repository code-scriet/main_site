# Email Templates & Deliverability Guide (Brevo)

**Last Updated:** February 5, 2026

This document explains the email template system, required API keys/config, and how to ensure emails land in Primary instead of Promotions. It is written so the same templates can be copied or reused across projects.

---

## 1) Email Service Provider

**Provider:** Brevo (formerly Sendinblue)  
**API Endpoint:** `https://api.brevo.com/v3/smtp/email`

The system uses Brevo transactional emails for:
- Welcome emails
- Event registrations, reminders, and announcements
- Password reset
- Hiring applications

---

## 2) Required Environment Variables (API)

Set these in the backend environment (Render/production):

- **`BREVO_API_KEY`**: Brevo API key used for sending emails.
- **`EMAIL_FROM`**: From-address shown to users (default: `code.scriet@codescriet.dev`).
- **`EMAIL_FROM_NAME`**: From-name shown to users (default: `code.scriet`).
- **`EMAIL_REPLY_TO`**: Reply-to address (default: `tech_admin@codescriet.dev`).

**Where used:** Email service is implemented in [apps/api/src/utils/email.ts](apps/api/src/utils/email.ts).

---

## 3) Template Engine & Structure

### 3.1 Core Generator
All templates are built by `generateEmailTemplate()` in [apps/api/src/utils/email.ts](apps/api/src/utils/email.ts). This is the **single source of truth** for layout, styles, typography, and colors.

The generator supports:
- **preheader** (hidden preview text)
- **accentColor** (primary brand highlight)
- **badge** (status label)
- **heroImage** (optional header image)
- **infoCards** (icon + label + value rows)
- **CTA / secondary CTA** buttons
- **footer** text

### 3.2 Markdown to HTML
`markdownToEmailHtml()` converts Markdown into **inline-styled HTML** so the output renders consistently across email clients.

Inline styles are applied to:
- `p, h1, h2, h3`
- `ul, ol, li`
- `a, strong, em, pre, code, blockquote`

### 3.3 Visual Design Details
**Brand feel:** dark, premium, code-club aesthetic.

**Structure (top to bottom):**
1. **Preheader** (hidden, improves open rate)
2. **Logo block** with gradient background and `&lt;code.scriet/&gt;`
3. **Content Card** with:
   - Accent line
   - Optional hero image
   - Badge
   - Title
   - Subtitle
   - Info cards (optional)
   - Body content
   - CTA button
   - Secondary CTA (optional)
4. **Footer** with links and contact info

**Fonts:** system fonts + monospace for code blocks
**Primary accent:** `#fbbf24` (gold)
**Background:** `#030712` (dark)

---

## 4) Template Inventory

The following templates are defined in `EmailTemplates` inside [apps/api/src/utils/email.ts](apps/api/src/utils/email.ts):

| Template | Trigger | Key Content |
|----------|---------|-------------|
| `welcome()` | User signup | Membership benefits, dashboard CTA |
| `eventRegistration()` | User registers for event | Event details, date/time/venue |
| `newAnnouncement()` | Admin creates announcement | Priority badge, full content |
| `newEvent()` | Admin creates event | Event info, registration CTA |
| `passwordReset()` | Password reset request | Secure reset link (60 min expiry) |
| `eventReminder()` | 24h before event | Reminder with prep tips |
| `registrationOpens()` | Event registration opens | Early access notification |
| `hiringApplication()` | User applies to join team | Application confirmation, next steps |
| `hiringSelected()` | Admin marks SELECTED | Congratulations, WhatsApp/Discord/Website info |
| `hiringRejected()` | Admin marks REJECTED | Encouragement, fundamentals advice, reapply invite |

Each returns:
```ts
{
  subject: string,
  html: string,
  text?: string
}
```

---

## 5) Admin Custom Text (Editable)

The admin dashboard can update text blocks in:
- [apps/api/src/config/email-templates.config.ts](apps/api/src/config/email-templates.config.ts)

Editable fields:
- `welcomeBody`
- `announcementIntro`
- `eventIntro`
- `footerText`

These fields accept Markdown and will be injected into templates.

---

## 6) Keeping Emails in the Primary Inbox

To avoid Promotions and increase Primary placement:

### ✅ Authentication & Domain Setup (Most Important)
1. **SPF**: Add correct SPF record for Brevo in DNS.
2. **DKIM**: Enable DKIM signing in Brevo settings.
3. **DMARC**: Add a DMARC policy (start with `p=none`, then `p=quarantine`).
4. **Dedicated sender domain**: Use `@codescriet.dev` only.
5. **Consistent “From” name/address** across all templates.

### ✅ Content Guidelines
- Avoid heavy marketing keywords: “FREE”, “LIMITED OFFER”, “BUY NOW”.
- Keep **one CTA** primary.
- Avoid large image-only emails. This design is text-forward with optional images.
- Include plain text version (`text`) for every email.

### ✅ Engagement & Reputation
- Send to engaged users only (opt-in).
- Keep complaint rate low.
- Avoid large spikes in volume.

### ✅ User-Level Signals
Ask members to:
- Add the sender to contacts.
- Move the email to Primary if it lands elsewhere.
- Reply once (simple thanks) to train the inbox.

---

## 7) Copying Templates to Another Project

To reuse this system:

1. Copy these files:
   - [apps/api/src/utils/email.ts](apps/api/src/utils/email.ts)
   - [apps/api/src/config/email-templates.config.ts](apps/api/src/config/email-templates.config.ts)
2. Provide required env vars (`BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`).
3. Update `SITE_URL` in [apps/api/src/utils/email.ts](apps/api/src/utils/email.ts).
4. Ensure `marked` is installed and available.

---

## 8) Quick Troubleshooting

- **Emails not sending** → Check `BREVO_API_KEY`, inspect logs in Brevo.
- **Emails in Promotions** → Verify DKIM/SPF, reduce promotional language.
- **Broken links** → Ensure `SITE_URL` is correct.
- **No custom text** → Check [apps/api/src/config/email-templates.config.ts](apps/api/src/config/email-templates.config.ts).

---

## 9) Security Notes

- Never commit API keys to git.
- Use server-side env vars only.
- Restrict Brevo API key permissions to **SMTP Send** only.

---

If you want changes in typography, colors, layout, or CTA styling, edit `generateEmailTemplate()` in [apps/api/src/utils/email.ts](apps/api/src/utils/email.ts).
