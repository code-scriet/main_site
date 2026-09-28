// Signed one-click unsubscribe links for bulk mail (RFC 8058).
//
// The token proves ownership of the address, so the endpoint needs no login -
// it works from any email client, including Gmail native Unsubscribe button.

import { signUnsubscribeToken, verifyUnsubscribeToken } from "./jwt.js";

export { signUnsubscribeToken, verifyUnsubscribeToken };

const apiBaseUrl = (): string =>
  (process.env.API_BASE_URL || process.env.BACKEND_URL || "http://localhost:5001").replace(/\/$/, "");

export const buildUnsubscribeUrl = (email: string): string =>
  apiBaseUrl() + "/api/mail/unsubscribe?token=" + encodeURIComponent(signUnsubscribeToken({ email }));
