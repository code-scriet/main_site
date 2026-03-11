// ---------------------------------------------------------------------------
// Cloudflare Worker — OG Meta Tag Injection for Social Crawlers
// ---------------------------------------------------------------------------
// When social media bots (Twitter, LinkedIn, Slack, WhatsApp, Discord, Facebook)
// request a page, this worker fetches the event/announcement data from the API
// and returns a minimal HTML page with correct OG meta tags.
//
// Non-bot requests pass through to the static site unchanged.
//
// Deployment:
//   1. Go to dash.cloudflare.com → Workers & Pages → Create
//   2. Paste this code
//   3. Add a Route: codescriet.dev/* → this worker
//   4. Deploy
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.codescriet.dev';
const SITE_URL = 'https://codescriet.dev';

const BOT_AGENTS = [
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'facebookexternalhit',
  'WhatsApp',
  'Discordbot',
  'TelegramBot',
  'Applebot',
  'Pinterestbot',
];

const DEFAULT_TITLE = 'codescriet — Official Coding Club of SCRIET';
const DEFAULT_DESC = 'The official coding club of SCRIET, CCS University Meerut. Join code.scriet for DSA, competitive programming, hackathons, and tech events.';
const DEFAULT_IMAGE = `${SITE_URL}/logo.jpeg`;

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHtml(url, title, description, image) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImage = escapeHtml(image);
  const safeUrl = escapeHtml(url);

  return `<!DOCTYPE html><html><head>
<title>${safeTitle}</title>
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDesc}" />
<meta property="og:image" content="${safeImage}" />
<meta property="og:url" content="${safeUrl}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="codescriet" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDesc}" />
<meta name="twitter:image" content="${safeImage}" />
<meta name="twitter:site" content="@codescriet" />
</head><body></body></html>`;
}

export default {
  async fetch(request) {
    const ua = request.headers.get('User-Agent') || '';
    const isBot = BOT_AGENTS.some((bot) => ua.includes(bot));

    if (!isBot) {
      return fetch(request);
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    let title = DEFAULT_TITLE;
    let description = DEFAULT_DESC;
    let image = DEFAULT_IMAGE;

    try {
      if (parts[0] === 'events' && parts[1]) {
        const apiRes = await fetch(`${API_BASE}/api/events/${encodeURIComponent(parts[1])}`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          const event = data.data || data;
          title = `${event.title} | codescriet`;
          description = event.shortDescription || (event.description || '').slice(0, 160) || DEFAULT_DESC;
          if (event.bannerImage || event.imageUrl) image = event.bannerImage || event.imageUrl;
        }
      } else if (parts[0] === 'announcements' && parts[1]) {
        const apiRes = await fetch(`${API_BASE}/api/announcements/${encodeURIComponent(parts[1])}`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          const ann = data.data || data;
          title = `${ann.title} | codescriet`;
          description = ann.shortDescription || (ann.body || '').slice(0, 160) || DEFAULT_DESC;
          if (ann.imageUrl) image = ann.imageUrl;
        }
      } else if (parts[0] === 'achievements' && parts[1]) {
        const apiRes = await fetch(`${API_BASE}/api/achievements/${encodeURIComponent(parts[1])}`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          const ach = data.data || data;
          title = `${ach.title} | codescriet`;
          description = ach.shortDescription || (ach.description || '').slice(0, 160) || DEFAULT_DESC;
          if (ach.imageUrl) image = ach.imageUrl;
        }
      } else if (parts[0] === 'network' && parts[1]) {
        const apiRes = await fetch(`${API_BASE}/api/network/${encodeURIComponent(parts[1])}`);
        if (apiRes.ok) {
          const data = await apiRes.json();
          const profile = data.data || data;
          const name = profile.user?.name || profile.name || parts[1];
          title = `${name} | codescriet Network`;
          description = profile.bio ? profile.bio.replace(/<[^>]*>/g, '').slice(0, 160) : DEFAULT_DESC;
          if (profile.user?.avatar) image = profile.user.avatar;
        }
      }
    } catch {
      // API fetch failed — use defaults
    }

    return new Response(buildHtml(url.href, title, description, image), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
