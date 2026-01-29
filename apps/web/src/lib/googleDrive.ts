/**
 * Image URL Utilities
 * 
 * Processes image URLs from various sources.
 * Supports direct URLs from Imgur, imgbb, Cloudinary, etc.
 * Also supports Google Drive share links (converts to direct URL).
 * 
 * Cloudinary transformations automatically handle aspect ratios:
 * - cover: Wide images for hero/banner sections
 * - card: Card thumbnails with center focus
 * - square: Perfect squares for avatars/profile pics
 * - gallery: Gallery images with preserved aspect ratio
 * - thumbnail/medium/large: General purpose with smart cropping
 * - fit: Fit entire image within bounds (no cropping, may letterbox)
 */

// Image preset types for different contexts
export type ImagePreset = 
  | 'thumbnail'   // Small preview, filled
  | 'medium'      // Medium size, filled
  | 'large'       // Large, preserves aspect
  | 'original'    // No resize, just optimize
  | 'cover'       // Wide banner/hero
  | 'card'        // Card thumbnail, filled
  | 'square'      // Square for avatars (1:1)
  | 'gallery'     // Gallery images, fit within bounds
  | 'event-cover' // Event page cover, wide
  | 'team-avatar' // Team member avatars (1:1, face detection)
  | 'fit';        // Fit entire image, no crop (may letterbox)

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
 * Adds Cloudinary transformations to optimize image size and handle aspect ratios
 * Uses smart cropping (g_auto) to focus on the most important part of the image
 */
function addCloudinaryTransformations(url: string, preset?: ImagePreset): string {
  // Check if it's a Cloudinary URL
  if (!url.includes('cloudinary.com')) return url;
  
  // Check if transformations are already applied (has transformation segment after /upload/)
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex !== -1) {
    const afterUpload = url.substring(uploadIndex + 8);
    // If there's already a transformation (contains comma or starts with common transforms)
    if (afterUpload.match(/^(c_|w_|h_|ar_|f_|q_|g_)/)) {
      // Remove existing transformations and apply new ones
      const versionMatch = afterUpload.match(/(v\d+\/)/);
      if (versionMatch) {
        const versionAndRest = afterUpload.substring(afterUpload.indexOf(versionMatch[0]));
        url = url.substring(0, uploadIndex + 8) + versionAndRest;
      }
    }
  }
  
  // Define transformations based on preset
  // c_fill = crop to fill exact dimensions (may crop edges)
  // c_lfill = limit fill - scales and crops to fill, focuses on center
  // c_fit = fit within dimensions (may have letterboxing)
  // c_limit = limit to max dimensions, preserve aspect ratio
  // c_pad = pad to exact dimensions with background
  // c_scale = scale to exact dimensions (may distort)
  // g_auto = smart gravity (auto-detect focus point)
  // g_center = center gravity
  // f_auto = auto format (webp for supported browsers)
  // q_auto = auto quality optimization
  // b_auto = auto background color for padding
  const transformations: Record<ImagePreset, string> = {
    // Small preview - fill container, auto-focus
    thumbnail: 'c_fill,g_auto,w_400,h_300,q_auto,f_auto',
    
    // Medium size - fill container, auto-focus  
    medium: 'c_fill,g_auto,w_800,h_600,q_auto,f_auto',
    
    // Large size, preserves original aspect ratio
    large: 'c_limit,w_1920,q_auto,f_auto',
    
    // Original size, just optimize format and quality
    original: 'q_auto,f_auto',
    
    // Wide banner/hero images - fill width, limit height, center focus
    cover: 'c_fill,g_center,w_1920,h_600,q_auto,f_auto',
    
    // Card thumbnails - fill with center focus for consistent cards
    card: 'c_fill,g_center,w_600,h_400,q_auto,f_auto',
    
    // Square images for avatars
    square: 'c_fill,g_center,w_400,h_400,q_auto,f_auto',
    
    // Gallery images - fit within bounds, preserve aspect
    gallery: 'c_limit,w_1200,h_900,q_auto,f_auto',
    
    // Event page cover - wide hero with center focus
    'event-cover': 'c_fill,g_center,w_1600,h_800,q_auto,f_auto',
    
    // Team member avatars (face detection for people)
    'team-avatar': 'c_fill,g_auto:face,w_300,h_300,q_auto,f_auto',
    
    // Fit entire image within bounds, no cropping (may have letterboxing)
    // Useful for logos or images where you don't want any cropping
    'fit': 'c_pad,b_auto,w_800,h_600,q_auto,f_auto',
  };
  
  const transform = transformations[preset || 'medium'];
  
  // Split URL at /upload/ and insert transformation
  const parts = url.split('/upload/');
  if (parts.length === 2) {
    return `${parts[0]}/upload/${transform}/${parts[1]}`;
  }
  
  return url;
}

/**
 * Processes an image URL - converts Google Drive links to direct URLs,
 * adds Cloudinary transformations, or passes through other URLs unchanged
 * 
 * @param url - The image URL to process
 * @param preset - The image preset for sizing/cropping (default: 'medium')
 */
export function processImageUrl(url: string, preset?: ImagePreset): string {
  if (!url) return '';
  
  // If it's a Google Drive URL, convert it
  if (isGoogleDriveUrl(url)) {
    const fileId = extractGoogleDriveFileId(url);
    if (fileId) {
      return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }
  }
  
  // Add Cloudinary transformations if applicable
  if (url.includes('cloudinary.com')) {
    return addCloudinaryTransformations(url, preset);
  }
  
  // Return URL as-is for all other sources (Imgur, imgbb, etc.)
  return url;
}

/**
 * Process an array of image URLs (for gallery)
 */
export function processImageGallery(urls: string[] | unknown, preset?: ImagePreset): string[] {
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
    .map(url => processImageUrl(url, preset));
}
