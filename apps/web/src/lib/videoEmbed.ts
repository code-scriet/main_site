const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID_PATTERN = /^[0-9]{6,20}$/;
const LOOM_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function setAllowedParams(target: URL, source: URL, keys: string[]): void {
  for (const key of keys) {
    const value = source.searchParams.get(key);
    if (value) {
      target.searchParams.set(key, value);
    }
  }
}

function parseTimeToSeconds(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  const matches = Array.from(trimmed.matchAll(/(\d+)(h|m|s)/g));
  if (matches.length === 0) {
    return null;
  }

  let totalSeconds = 0;
  let consumedLength = 0;

  for (const match of matches) {
    const amount = Number(match[1]);
    const unit = match[2];
    consumedLength += match[0].length;

    if (unit === 'h') {
      totalSeconds += amount * 60 * 60;
    } else if (unit === 'm') {
      totalSeconds += amount * 60;
    } else {
      totalSeconds += amount;
    }
  }

  if (consumedLength !== trimmed.length || totalSeconds <= 0) {
    return null;
  }

  return String(totalSeconds);
}

function normalizeYouTubeEmbedUrl(source: URL, host: string): string | null {
  const segments = source.pathname.split('/').filter(Boolean);
  let videoId: string | null = null;

  if (host === 'youtu.be') {
    videoId = segments[0] ?? null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (segments[0] === 'watch') {
      videoId = source.searchParams.get('v');
    } else if ((segments[0] === 'embed' || segments[0] === 'shorts') && segments[1]) {
      videoId = segments[1];
    }
  }

  if (!videoId || !YOUTUBE_ID_PATTERN.test(videoId)) {
    return null;
  }

  const targetHost = host === 'youtube-nocookie.com' ? 'www.youtube-nocookie.com' : 'www.youtube.com';
  const embedUrl = new URL(`https://${targetHost}/embed/${videoId}`);
  const start = parseTimeToSeconds(source.searchParams.get('start') ?? source.searchParams.get('t'));
  if (start) {
    embedUrl.searchParams.set('start', start);
  }
  setAllowedParams(embedUrl, source, ['end', 'list', 'index', 'si', 'rel', 'controls', 'modestbranding']);
  return embedUrl.toString();
}

function normalizeVimeoEmbedUrl(source: URL, host: string): string | null {
  const segments = source.pathname.split('/').filter(Boolean);
  const videoId = host === 'player.vimeo.com'
    ? (segments[0] === 'video' ? segments[1] ?? null : null)
    : segments[0] ?? null;

  if (!videoId || !VIMEO_ID_PATTERN.test(videoId)) {
    return null;
  }

  const embedUrl = new URL(`https://player.vimeo.com/video/${videoId}`);
  setAllowedParams(embedUrl, source, ['h', 'autoplay', 'muted', 'loop']);
  return embedUrl.toString();
}

function normalizeLoomEmbedUrl(source: URL): string | null {
  const segments = source.pathname.split('/').filter(Boolean);
  const videoId =
    segments[0] === 'embed'
      ? segments[1] ?? null
      : segments[0] === 'share'
        ? segments[1] ?? null
        : null;

  if (!videoId || !LOOM_ID_PATTERN.test(videoId)) {
    return null;
  }

  const embedUrl = new URL(`https://www.loom.com/embed/${videoId}`);
  setAllowedParams(embedUrl, source, ['sid']);
  return embedUrl.toString();
}

export function normalizeTrustedVideoEmbedUrl(rawUrl: string | null | undefined): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return null;
  }

  const host = normalizeHostname(parsed.hostname);

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    return normalizeYouTubeEmbedUrl(parsed, host);
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    return normalizeVimeoEmbedUrl(parsed, host);
  }

  if (host === 'loom.com') {
    return normalizeLoomEmbedUrl(parsed);
  }

  return null;
}
