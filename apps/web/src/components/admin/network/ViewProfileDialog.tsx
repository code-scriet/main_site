import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Github,
  Globe,
  Linkedin,
  Loader2,
  Pencil,
  Phone,
  Twitter,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Markdown } from '@/components/ui/markdown';
import type { NetworkProfile, NetworkStatus } from '@/lib/api';

const statusColors: Record<NetworkStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  VERIFIED: 'bg-green-100 text-green-700 border-green-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
};

const connectionTypeLabels: Record<string, string> = {
  GUEST_SPEAKER: 'Guest Speaker',
  GMEET_SESSION: 'GMeet Session',
  EVENT_JUDGE: 'Event Judge',
  MENTOR: 'Mentor',
  INDUSTRY_PARTNER: 'Industry Partner',
  ALUMNI: 'Alumni',
  OTHER: 'Other',
};

interface ViewProfileDialogProps {
  profile: NetworkProfile | null;
  actionLoading: boolean;
  onClose: () => void;
  onEdit: (profile: NetworkProfile) => void;
  onVerify: (profile: NetworkProfile) => void;
  onReject: (profile: NetworkProfile) => void;
}

export function ViewProfileDialog({
  profile,
  actionLoading,
  onClose,
  onEdit,
  onVerify,
  onReject,
}: ViewProfileDialogProps) {
  return (
    <Dialog open={!!profile} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {profile && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden">
                  <img
                    src={profile.profilePhoto || '/fallback-avatar.svg'}
                    alt={profile.fullName}
                    className="w-full h-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = '/fallback-avatar.svg';
                    }}
                  />
                </div>
                <div>
                  <span>{profile.fullName}</span>
                  <Badge
                    variant="outline"
                    className={`ml-2 ${statusColors[profile.status]}`}
                  >
                    {profile.status}
                  </Badge>
                </div>
              </DialogTitle>
              <DialogDescription>
                {profile.designation} at {profile.company}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Email</p>
                  <p className="font-medium">{profile.user?.email}</p>
                </div>
                <div>
                  <p className="text-gray-500">Industry</p>
                  <p className="font-medium">{profile.industry}</p>
                </div>
                <div>
                  <p className="text-gray-500">Connection Type</p>
                  <p className="font-medium">
                    {connectionTypeLabels[profile.connectionType]}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Connected Since</p>
                  <p className="font-medium">{profile.connectedSince || 'Not specified'}</p>
                </div>
                {profile.phone && (
                  <div>
                    <p className="text-gray-500">Phone</p>
                    <p className="font-medium flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {profile.phone}
                    </p>
                  </div>
                )}
              </div>

              {profile.bio && (
                <div>
                  <p className="text-gray-500 text-sm mb-1">Bio</p>
                  <p className="text-sm bg-gray-50 p-3 rounded-md">{profile.bio}</p>
                </div>
              )}

              {profile.connectionNote && (
                <div>
                  <p className="text-gray-500 text-sm mb-1">Connection Details</p>
                  <p className="text-sm bg-amber-50 p-3 rounded-md border border-amber-100">
                    {profile.connectionNote}
                  </p>
                </div>
              )}

              {profile.adminNotes && (
                <div>
                  <p className="text-gray-500 text-sm mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Admin Notes (Highlights)
                  </p>
                  <div className="text-sm bg-gray-50 p-3 rounded-md border prose prose-sm max-w-none">
                    <Markdown>{profile.adminNotes}</Markdown>
                  </div>
                </div>
              )}

              <div>
                <p className="text-gray-500 text-sm mb-2">Social Links</p>
                <div className="flex gap-3">
                  {profile.linkedinUsername && (
                    <a
                      href={`https://linkedin.com/in/${profile.linkedinUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
                    >
                      <Linkedin className="h-4 w-4" /> LinkedIn
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {profile.twitterUsername && (
                    <a
                      href={`https://twitter.com/${profile.twitterUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sky-500 hover:underline text-sm"
                    >
                      <Twitter className="h-4 w-4" /> Twitter
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {profile.githubUsername && (
                    <a
                      href={`https://github.com/${profile.githubUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-gray-800 hover:underline text-sm"
                    >
                      <Github className="h-4 w-4" /> GitHub
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {profile.personalWebsite && (
                    <a
                      href={profile.personalWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-green-600 hover:underline text-sm"
                    >
                      <Globe className="h-4 w-4" /> Website
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {!profile.linkedinUsername &&
                    !profile.twitterUsername &&
                    !profile.githubUsername &&
                    !profile.personalWebsite && (
                      <span className="text-gray-400 text-sm">No social links provided</span>
                    )}
                </div>
              </div>

              {profile.status === 'REJECTED' && profile.rejectionReason && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-700 text-sm font-medium">Rejection Reason:</p>
                  <p className="text-red-600 text-sm">{profile.rejectionReason}</p>
                </div>
              )}
            </div>

            <DialogFooter className="flex gap-2 w-full flex-wrap justify-end">
              <Button variant="outline" onClick={() => onEdit(profile)}>
                <Pencil className="h-4 w-4 mr-1" /> Edit Profile
              </Button>
              {profile.status === 'PENDING' && (
                <>
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => onVerify(profile)}
                    disabled={actionLoading}
                  >
                    {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Verify
                  </Button>
                  <Button variant="destructive" onClick={() => onReject(profile)}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
