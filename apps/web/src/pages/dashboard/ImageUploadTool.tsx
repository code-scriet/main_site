import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { 
  Upload, Image as ImageIcon, Copy, Check, X, Loader2, 
  ExternalLink, AlertCircle
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

interface UploadedImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

export default function ImageUploadTool() {
  const { token, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const canUpload = ['ADMIN', 'PRESIDENT', 'CORE_MEMBER'].includes(user?.role || '');

  const handleUpload = useCallback(async (file: File) => {
    if (!token) {
      setError('You must be logged in to upload images');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const url = await api.uploadImage(file, token);
      const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve({ width: 0, height: 0 });
        image.src = url;
      });
      setUploadedImage({
        url,
        publicId: '',
        width: dimensions.width,
        height: dimensions.height,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [token]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const copyToClipboard = async () => {
    if (!uploadedImage) return;
    
    try {
      await navigator.clipboard.writeText(uploadedImage.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy image URL');
    }
  };

  const clearImage = () => {
    setUploadedImage(null);
    setCopied(false);
    setError(null);
  };

  // Handle escape key to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && uploadedImage) {
      clearImage();
    }
  }, [uploadedImage]);

  // Add escape key listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!canUpload) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-amber-900">Image Upload</h1>
          <p className="text-gray-600 mt-1">Upload images to Cloudinary</p>
        </div>
        
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-900">Access Denied</h3>
            <p className="text-red-700 mt-2">Only Admins and Coordinators can upload images.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-amber-900">Image Upload Tool</h1>
        <p className="text-gray-600 mt-1">
          Upload images to Cloudinary and get embedding links
        </p>
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-amber-600" />
            Upload Image
          </CardTitle>
          <CardDescription>
            Drag and drop an image or click to select. Max size: 5MB
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              dragActive 
                ? 'border-amber-500 bg-amber-50' 
                : 'border-gray-300 hover:border-amber-400 hover:bg-amber-50/50'
            } ${uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {uploading ? (
              <div className="py-8">
                <Loader2 className="h-12 w-12 animate-spin text-amber-600 mx-auto mb-4" />
                <p className="text-gray-600">Uploading...</p>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                  <ImageIcon className="h-8 w-8 text-amber-600" />
                </div>
                <p className="text-gray-900 font-medium mb-1">
                  Drop your image here
                </p>
                <p className="text-sm text-gray-500">
                  or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  PNG, JPG, GIF, WebP up to 5MB
                </p>
              </>
            )}
          </div>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"
              >
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-700 font-medium">Upload Failed</p>
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
                <button 
                  onClick={() => setError(null)}
                  className="ml-auto text-red-400 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Uploaded Image Result */}
      <AnimatePresence>
        {uploadedImage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-green-800">
                    <Check className="h-5 w-5" />
                    Image Uploaded!
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearImage}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Close
                  </Button>
                </div>
                <CardDescription className="text-green-700">
                  Press <kbd className="px-1.5 py-0.5 bg-white rounded border text-xs">Esc</kbd> or click Close to dismiss
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preview */}
                <div className="rounded-lg overflow-hidden border border-green-200 bg-white">
                  <img
                    src={uploadedImage.url}
                    alt="Uploaded"
                    className="max-h-64 w-full object-contain"
                  />
                </div>

                {/* Image Info */}
                <div className="flex flex-wrap gap-4 text-sm text-green-700">
                  <span>
                    <strong>Size:</strong> {uploadedImage.width} × {uploadedImage.height}
                  </span>
                </div>

                {/* URL Copy Area */}
                <div className="space-y-2">
                  <label htmlFor="image-upload-tool-url" className="text-sm font-medium text-gray-700">
                    Image URL (click to copy)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="image-upload-tool-url"
                      value={uploadedImage.url}
                      readOnly
                      className="font-mono text-sm bg-white"
                      onClick={copyToClipboard}
                    />
                    <Button
                      onClick={copyToClipboard}
                      variant={copied ? 'default' : 'outline'}
                      className={copied ? 'bg-green-600 hover:bg-green-700' : ''}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Open in New Tab */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(uploadedImage.url, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in New Tab
                  </Button>
                </div>

                {/* Usage Hint */}
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>Tip:</strong> Use this URL in event descriptions, announcements, or anywhere you need an image. 
                    The image is stored in Cloudinary and will be automatically optimized.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How to Use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-600">
          <ol className="list-decimal list-inside space-y-2">
            <li>Upload an image using drag & drop or click to select</li>
            <li>Once uploaded, click the <strong>Copy</strong> button to copy the URL</li>
            <li>Paste the URL in your event cover image, description, or announcement</li>
            <li>Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border text-xs">Esc</kbd> or click Close to dismiss the result</li>
          </ol>
          <p className="text-gray-500 mt-4">
            <strong>Note:</strong> Images are stored permanently in Cloudinary. The link shown here 
            is not saved in the database - make sure to copy it before closing!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
