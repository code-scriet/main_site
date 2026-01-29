/**
 * Image URL Utilities
 * 
 * Processes image URLs from various sources.
 * Supports direct URLs from Imgur, imgbb, Cloudinary, etc.
 * Also supports Google Drive share links (converts to direct URL).
 */

/**
 * Extracts the file ID from Google Drive URL formats
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null;
  
  // Check if it's a Google Drive URL
  if (!url.includes('drive.google.com') && !url.includes('docs.google.com')) {
    return null;
  }
  
  // Pattern 1: /file/d/FILE_ID/
  const filePattern = /\/file\/d\/([a-zA-Z0-9_-]+)/;
  const fileMatch = url.match(filePattern);
  if (fileMatch) return fileMatch[1];
  
  // Pattern 2: ?id=FILE_ID or &id=FILE_ID
  const idPattern = /[?&]id=([a-zA-Z0-9_-]+)/;
  const idMatch = url.match(idPattern);
  if (idMatch) return idMatch[1];
  
  return null;
}

/**
 * Checks if a URL is a Google Drive URL
 */
export function isGoogleDriveUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('drive.google.com') || url.includes('docs.google.com');
}

/**
 * Processes an image URL - converts Google Drive links to direct URLs,
 * passes through other URLs unchanged (Imgur, imgbb, Cloudinary, etc.)
 */
export function processImageUrl(url: string, _size?: 'thumbnail' | 'medium' | 'large' | 'original'): string {
  if (!url) return '';
  
  // If it's a Google Drive URL, convert it
  if (isGoogleDriveUrl(url)) {
    const fileId = extractGoogleDriveFileId(url);
    if (fileId) {
      return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }
  }
  
  // Return URL as-is for all other sources (Imgur, imgbb, Cloudinary, etc.)
  return url;
}

/**
 * Process an array of image URLs (for gallery)
 */
export function processImageGallery(urls: string[] | unknown, size?: 'thumbnail' | 'medium' | 'large' | 'original'): string[] {
  if (!urls) return [];
  
  // If it's a string (JSON), try to parse it
  if (typeof urls === 'string') {
    try {
      urls = JSON.parse(urls);
    } catch {
      return [];
    }
  }
  
  // Ensure it's an array
  if (!Array.isArray(urls)) return [];
  
  // Process each URL
  return urls
    .filter((url): url is string => url && typeof url === 'string')
    .map(url => processImageUrl(url, size));
}
