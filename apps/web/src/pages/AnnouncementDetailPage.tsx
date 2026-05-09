import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { AnnouncementSchema, BreadcrumbSchema } from '@/components/ui/schema';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { LightboxGallery } from '@/components/media/LightboxGallery';
import { 
  Calendar, Loader2, ArrowLeft, AlertCircle, Info, AlertTriangle, 
  Bell, User, ExternalLink, Image as ImageIcon, FileText, 
  Link as LinkIcon, Tag, Pin, Star, Share2, Clock
} from 'lucide-react';
import { api, type Announcement } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';

const priorityConfig = {
  LOW: { label: 'Low Priority', color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Info, bgClass: 'from-gray-500 to-slate-600' },
  MEDIUM: { label: 'Medium Priority', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: Bell, bgClass: 'from-blue-500 to-indigo-600' },
  HIGH: { label: 'High Priority', color: 'bg-orange-100 text-orange-700 border-orange-300', icon: AlertTriangle, bgClass: 'from-orange-500 to-amber-600' },
  URGENT: { label: 'Urgent', color: 'bg-red-100 text-red-700 border-red-300', icon: AlertCircle, bgClass: 'from-red-500 to-rose-600' },
};

// Image Gallery Component with Lightbox
function ImageGallery({ images }: { images: string[] }) {
  return (
    <LightboxGallery images={images} imageAltPrefix="Announcement image" />
  );
}

// Attachment type icons
const attachmentIcons: Record<string, React.ReactNode> = {
  pdf: <FileText className="h-4 w-4" />,
  doc: <FileText className="h-4 w-4" />,
  link: <LinkIcon className="h-4 w-4" />,
  other: <ExternalLink className="h-4 w-4" />,
};

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShareToast, setShowShareToast] = useState(false);

  useEffect(() => {
    const fetchAnnouncement = async () => {
      if (!id) {
        setError('Announcement not found');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await api.getAnnouncement(id);
        if (data.slug && id !== data.slug) {
          navigate(`/announcements/${data.slug}`, { replace: true });
          return;
        }
        setAnnouncement(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load announcement');
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncement();
  }, [id]);

  const handleShare = async () => {
    const url = window.location.href;
    const title = announcement?.title || 'Announcement';
    
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(url);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    }
  };

  // Loading state
  if (loading) {
    return (
      <Layout>
        <section className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 py-12 sm:py-20">
          <div className="container mx-auto px-4">
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-12 w-12 text-amber-600 animate-spin mb-4" />
              <p className="text-gray-600">Loading announcement...</p>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  // Error state
  if (error || !announcement) {
    return (
      <Layout>
        <SEO title="Announcement Not Found" description="The requested announcement could not be found." noIndex={true} />
        <section className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 py-12 sm:py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-xl mx-auto text-center py-20">
              <div className="bg-red-50 border border-red-200 rounded-xl p-8">
                <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-red-700 mb-2">Announcement Not Found</h1>
                <p className="text-red-600 mb-6">{error || 'The announcement you are looking for does not exist.'}</p>
                <Button onClick={() => navigate('/announcements')} variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Announcements
                </Button>
              </div>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  const config = priorityConfig[announcement.priority];
  const PriorityIcon = config.icon;
  const coverImage = announcement.imageUrl ? processImageUrl(announcement.imageUrl, 'cover') : null;
  const imageGallery = announcement.imageGallery || [];
  const attachments = announcement.attachments || [];
  const links = announcement.links || [];
  const tags = announcement.tags || [];

  return (
    <Layout>
      <SEO
        title={`${announcement.title} | codescriet Announcements`}
        description={(announcement.shortDescription || announcement.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)}
        url={`/announcements/${announcement.slug}`}
        image={announcement.imageUrl || undefined}
      />
      
      {/* Schema markup for SEO */}
      <AnnouncementSchema
        title={announcement.title}
        description={announcement.shortDescription || announcement.body.slice(0, 160)}
        image={announcement.imageUrl || undefined}
        datePublished={announcement.createdAt}
        dateModified={announcement.createdAt}
        slug={announcement.slug}
      />
      
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Announcements', url: 'https://codescriet.dev/announcements' },
          { name: announcement.title, url: `https://codescriet.dev/announcements/${announcement.slug}` },
        ]}
      />
      
      <article className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
        {/* Hero Section */}
        <div className={`relative ${coverImage ? 'h-[40vh] sm:h-[50vh]' : 'h-[30vh]'} bg-gradient-to-br ${config.bgClass}`}>
          {coverImage && (
            <>
              <img
                src={coverImage}
                alt={announcement.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
            </>
          )}
          
          {/* Back Button */}
          <div className="absolute top-4 left-4 z-10">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/announcements')}
              className="bg-white/90 hover:bg-white shadow-lg"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
          
          {/* Share Button */}
          <div className="absolute top-4 right-4 z-10">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleShare}
              className="bg-white/90 hover:bg-white shadow-lg"
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
          </div>
          
          {/* Hero Content */}
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8">
            <div className="container mx-auto max-w-5xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* Badges */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge className={`${config.color} border`}>
                    <PriorityIcon className="h-3 w-3 mr-1" />
                    {config.label}
                  </Badge>
                  {announcement.pinned && (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                      <Pin className="h-3 w-3 mr-1" />
                      Pinned
                    </Badge>
                  )}
                  {announcement.featured && (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-300">
                      <Star className="h-3 w-3 mr-1" />
                      Featured
                    </Badge>
                  )}
                </div>
                
                <h1 className="mb-3 text-2xl font-bold text-white sm:text-3xl md:text-4xl lg:text-5xl">
                  {announcement.title}
                </h1>
                
                {/* Meta info */}
                <div className={`flex flex-wrap items-center gap-3 sm:gap-4 text-sm ${coverImage ? 'text-white/90' : 'text-white/90'}`}>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDateTime(announcement.createdAt)}</span>
                  </div>
                  {announcement.creator && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-4 w-4" />
                      <span>By {announcement.creator.name}</span>
                    </div>
                  )}
                  {announcement.expiresAt && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      <span>Expires {formatDate(announcement.expiresAt)}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-8 sm:py-12">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Content Column */}
              <div className="lg:col-span-2 space-y-8">
                {/* Short Description */}
                {announcement.shortDescription && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <Card className="border-amber-200 bg-amber-50/50">
                      <CardContent className="pt-6">
                        <p className="text-lg text-gray-700 italic">
                          {announcement.shortDescription}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Body Content */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Card className="border-amber-200 overflow-hidden">
                    <CardContent className="pt-6">
                      <div className="prose prose-amber max-w-none prose-headings:text-amber-900 prose-a:text-amber-600 prose-strong:text-amber-900">
                        <Markdown>{announcement.body}</Markdown>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Image Gallery */}
                {imageGallery.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Card className="border-amber-200">
                      <CardHeader>
                        <CardTitle className="text-amber-900 flex items-center gap-2">
                          <ImageIcon className="h-5 w-5 text-amber-600" />
                          Gallery
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ImageGallery images={imageGallery} />
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Tags */}
                {tags.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Card className="border-amber-200">
                      <CardHeader>
                        <CardTitle className="text-amber-900 text-lg flex items-center gap-2">
                          <Tag className="h-5 w-5 text-amber-600" />
                          Tags
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {tags.map((tag, index) => (
                            <Badge key={index} variant="outline" className="border-amber-300 text-amber-700">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Attachments */}
                {attachments.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Card className="border-amber-200">
                      <CardHeader>
                        <CardTitle className="text-amber-900 text-lg flex items-center gap-2">
                          <FileText className="h-5 w-5 text-amber-600" />
                          Attachments
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {attachments.map((attachment, index) => (
                            <a
                              key={index}
                              href={attachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors group"
                            >
                              <div className="p-2 bg-amber-200 rounded-lg group-hover:bg-amber-300 transition-colors">
                                {attachmentIcons[attachment.type || 'other']}
                              </div>
                              <span className="font-medium text-gray-700 group-hover:text-amber-700 transition-colors flex-1 truncate">
                                {attachment.title}
                              </span>
                              <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-amber-600" />
                            </a>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Links */}
                {links.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Card className="border-amber-200">
                      <CardHeader>
                        <CardTitle className="text-amber-900 text-lg flex items-center gap-2">
                          <LinkIcon className="h-5 w-5 text-amber-600" />
                          Related Links
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {links.map((link, index) => (
                            <a
                              key={index}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors group"
                            >
                              <div className="p-2 bg-amber-200 rounded-lg group-hover:bg-amber-300 transition-colors">
                                <ExternalLink className="h-4 w-4" />
                              </div>
                              <span className="font-medium text-gray-700 group-hover:text-amber-700 transition-colors flex-1 truncate">
                                {link.title}
                              </span>
                              <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-amber-600" />
                            </a>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Posted By Card */}
                {announcement.creator && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <Card className="border-amber-200">
                      <CardHeader>
                        <CardTitle className="text-amber-900 text-lg">Posted By</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3">
                          {announcement.creator.avatar ? (
                            <img
                              src={processImageUrl(announcement.creator.avatar, 'square')}
                              alt={announcement.creator.name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                              <User className="h-6 w-6 text-amber-600" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-gray-900">{announcement.creator.name}</p>
                            <p className="text-sm text-gray-500">{formatDate(announcement.createdAt)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* Share Toast */}
      <AnimatePresence>
        {showShareToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-lg z-50"
          >
            Link copied to clipboard!
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
