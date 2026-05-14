import {
  Calendar,
  FileText,
  Github,
  Globe,
  Linkedin,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Save,
  Trash2,
  Twitter,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Markdown } from '@/components/ui/markdown';
import { Textarea } from '@/components/ui/textarea';
import type { NetworkEvent, NetworkProfile } from '@/lib/api';

const connectionTypeLabels: Record<string, string> = {
  GUEST_SPEAKER: 'Guest Speaker',
  GMEET_SESSION: 'GMeet Session',
  EVENT_JUDGE: 'Event Judge',
  MENTOR: 'Mentor',
  INDUSTRY_PARTNER: 'Industry Partner',
  ALUMNI: 'Alumni',
  OTHER: 'Other',
};

interface EditProfileDialogProps {
  target: NetworkProfile | null;
  form: Record<string, string>;
  onFormChange: (next: Record<string, string>) => void;
  events: NetworkEvent[];
  onAddEvent: () => void;
  onUpdateEvent: (index: number, field: keyof NetworkEvent, value: string) => void;
  onRemoveEvent: (index: number) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function EditProfileDialog({
  target,
  form,
  onFormChange,
  events,
  onAddEvent,
  onUpdateEvent,
  onRemoveEvent,
  saving,
  onCancel,
  onSave,
}: EditProfileDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {target && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-amber-600" />
                Edit Profile — {target.fullName}
              </DialogTitle>
              <DialogDescription>
                Edit profile details and add admin notes (markdown supported).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-network-full-name">Full Name</Label>
                  <Input
                    id="admin-network-full-name"
                    value={form.fullName || ''}
                    onChange={(e) => onFormChange({ ...form, fullName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-network-designation">Designation</Label>
                  <Input
                    id="admin-network-designation"
                    value={form.designation || ''}
                    onChange={(e) => onFormChange({ ...form, designation: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-network-company">Company</Label>
                  <Input
                    id="admin-network-company"
                    value={form.company || ''}
                    onChange={(e) => onFormChange({ ...form, company: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-network-industry">Industry</Label>
                  <Input
                    id="admin-network-industry"
                    value={form.industry || ''}
                    onChange={(e) => onFormChange({ ...form, industry: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-network-connection-type">Connection Type</Label>
                <select
                  id="admin-network-connection-type"
                  value={form.connectionType || ''}
                  onChange={(e) => onFormChange({ ...form, connectionType: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select Connection Type</option>
                  {Object.entries(connectionTypeLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {form.connectionType === 'ALUMNI' && (
                <div className="p-4 bg-amber-50/50 rounded-lg border border-amber-100 space-y-4">
                  <h4 className="font-semibold text-amber-900 text-sm">Alumni Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-passout-year">Passout Year</Label>
                      <Input
                        id="admin-network-passout-year"
                        type="number"
                        value={form.passoutYear || ''}
                        onChange={(e) => onFormChange({ ...form, passoutYear: e.target.value })}
                        placeholder="e.g. 2024"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-current-location">Current Location</Label>
                      <Input
                        id="admin-network-current-location"
                        value={form.currentLocation || ''}
                        onChange={(e) => onFormChange({ ...form, currentLocation: e.target.value })}
                        placeholder="e.g. Bangalore, India"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-degree">Degree</Label>
                      <Input
                        id="admin-network-degree"
                        value={form.degree || ''}
                        onChange={(e) => onFormChange({ ...form, degree: e.target.value })}
                        placeholder="e.g. B.Tech"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-branch">Branch</Label>
                      <Input
                        id="admin-network-branch"
                        value={form.branch || ''}
                        onChange={(e) => onFormChange({ ...form, branch: e.target.value })}
                        placeholder="e.g. Computer Science"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-network-roll-number">College Roll Number</Label>
                      <Input
                        id="admin-network-roll-number"
                        value={form.rollNumber || ''}
                        onChange={(e) => onFormChange({ ...form, rollNumber: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-network-achievements">Achievements / Highlights</Label>
                    <Textarea
                      id="admin-network-achievements"
                      value={form.achievements || ''}
                      onChange={(e) => onFormChange({ ...form, achievements: e.target.value })}
                      placeholder="Notable college achievements..."
                      rows={2}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="admin-network-phone" className="flex items-center gap-1">
                  <Phone className="h-4 w-4" /> Phone Number
                </Label>
                <Input
                  id="admin-network-phone"
                  value={form.phone || ''}
                  onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
                  placeholder="+91 9876543210"
                />
                <p className="text-xs text-gray-400">Private — not shown publicly</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-network-bio">Bio</Label>
                <Textarea
                  id="admin-network-bio"
                  value={form.bio || ''}
                  onChange={(e) => onFormChange({ ...form, bio: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-network-profile-photo">Profile Photo URL</Label>
                <Input
                  id="admin-network-profile-photo"
                  value={form.profilePhoto || ''}
                  onChange={(e) => onFormChange({ ...form, profilePhoto: e.target.value })}
                  placeholder="https://example.com/photo.jpg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-network-linkedin" className="flex items-center gap-1 text-sm">
                    <Linkedin className="h-3 w-3 text-blue-600" /> LinkedIn
                  </Label>
                  <Input
                    id="admin-network-linkedin"
                    value={form.linkedinUsername || ''}
                    onChange={(e) => onFormChange({ ...form, linkedinUsername: e.target.value })}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-network-twitter" className="flex items-center gap-1 text-sm">
                    <Twitter className="h-3 w-3 text-sky-500" /> Twitter
                  </Label>
                  <Input
                    id="admin-network-twitter"
                    value={form.twitterUsername || ''}
                    onChange={(e) => onFormChange({ ...form, twitterUsername: e.target.value })}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-network-github" className="flex items-center gap-1 text-sm">
                    <Github className="h-3 w-3" /> GitHub
                  </Label>
                  <Input
                    id="admin-network-github"
                    value={form.githubUsername || ''}
                    onChange={(e) => onFormChange({ ...form, githubUsername: e.target.value })}
                    placeholder="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-network-website" className="flex items-center gap-1 text-sm">
                    <Globe className="h-3 w-3 text-green-600" /> Website
                  </Label>
                  <Input
                    id="admin-network-website"
                    value={form.personalWebsite || ''}
                    onChange={(e) => onFormChange({ ...form, personalWebsite: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-network-connection-note">Connection Details</Label>
                <Textarea
                  id="admin-network-connection-note"
                  value={form.connectionNote || ''}
                  onChange={(e) => onFormChange({ ...form, connectionNote: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-network-connected-since">Connected Since (Year)</Label>
                  <Input
                    id="admin-network-connected-since"
                    type="number"
                    value={form.connectedSince || ''}
                    onChange={(e) => onFormChange({ ...form, connectedSince: e.target.value })}
                    min={2000}
                    max={new Date().getFullYear()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-network-display-order">Display Order Number</Label>
                  <Input
                    id="admin-network-display-order"
                    type="number"
                    value={form.displayOrder || '0'}
                    onChange={(e) => onFormChange({ ...form, displayOrder: e.target.value })}
                    min={0}
                  />
                  <p className="text-xs text-gray-400">
                    Lower number appears earlier on network/home listings.
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <p className="flex items-center gap-2 text-base font-semibold">
                  <FileText className="h-4 w-4 text-amber-600" />
                  Highlights &amp; Contributions (Admin Notes)
                </p>
                <p className="text-xs text-gray-500">
                  Write in Markdown. This content will be displayed publicly on the profile page under "Highlights &amp; Contributions". Use this to note what the person achieved, topics they covered in sessions, awards, etc.
                </p>
                <Textarea
                  id="admin-network-admin-notes"
                  value={form.adminNotes || ''}
                  onChange={(e) => onFormChange({ ...form, adminNotes: e.target.value })}
                  rows={8}
                  placeholder={'## Session Topic\nConducted a session on **React Server Components** covering:\n- Server vs Client components\n- Data fetching patterns\n- Performance benefits\n\n## Achievements\n- 🏆 Helped 3 students land internships\n- Published research paper on distributed systems'}
                  className="font-mono text-sm"
                />
                {form.adminNotes && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Preview</p>
                    <div className="p-4 bg-gray-50 rounded-lg border prose prose-sm max-w-none">
                      <Markdown>{form.adminNotes}</Markdown>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-base font-semibold">
                    <Calendar className="h-4 w-4 text-amber-600" />
                    Sessions &amp; Events
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={onAddEvent}>
                    <Plus className="h-3 w-3 mr-1" /> Add Event
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Record sessions, talks, or events this person hosted or participated in. This will be displayed as a timeline on their profile.
                </p>

                {events.length === 0 ? (
                  <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <Video className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400">No events added yet</p>
                    <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={onAddEvent}>
                      <Plus className="h-3 w-3 mr-1" /> Add First Event
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {events.map((event, index) => (
                      <div key={index} className="p-4 bg-gray-50 rounded-lg border relative">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-6 w-6 text-gray-400 hover:text-red-500"
                          onClick={() => onRemoveEvent(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-8">
                          <div className="col-span-2 sm:col-span-1">
                            <Label htmlFor={`admin-network-event-title-${index}`} className="text-xs">Event Title *</Label>
                            <Input
                              id={`admin-network-event-title-${index}`}
                              value={event.title}
                              onChange={(e) => onUpdateEvent(index, 'title', e.target.value)}
                              placeholder="React Server Components Workshop"
                              className="mt-1"
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Label htmlFor={`admin-network-event-date-${index}`} className="text-xs">Date</Label>
                            <Input
                              id={`admin-network-event-date-${index}`}
                              value={event.date}
                              onChange={(e) => onUpdateEvent(index, 'date', e.target.value)}
                              placeholder="January 2026"
                              className="mt-1"
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Label htmlFor={`admin-network-event-type-${index}`} className="text-xs">Type</Label>
                            <Input
                              id={`admin-network-event-type-${index}`}
                              value={event.type || ''}
                              onChange={(e) => onUpdateEvent(index, 'type', e.target.value)}
                              placeholder="GMeet Session, In-Person Talk, Workshop"
                              className="mt-1"
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Label htmlFor={`admin-network-event-link-${index}`} className="text-xs">Recording/Link (optional)</Label>
                            <Input
                              id={`admin-network-event-link-${index}`}
                              value={event.link || ''}
                              onChange={(e) => onUpdateEvent(index, 'link', e.target.value)}
                              placeholder="https://youtube.com/..."
                              className="mt-1"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label htmlFor={`admin-network-event-description-${index}`} className="text-xs">Description (optional)</Label>
                            <Textarea
                              id={`admin-network-event-description-${index}`}
                              value={event.description || ''}
                              onChange={(e) => onUpdateEvent(index, 'description', e.target.value)}
                              placeholder="Topics covered, key takeaways, etc."
                              rows={2}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                onClick={onSave}
                disabled={saving}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
