import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Mail,
  Send,
  Users,
  Globe,
  Search,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Code,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Markdown } from '@/components/ui/markdown';

type BodyType = 'markdown' | 'html';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

interface Recipient {
  id: string;
  name: string;
  email: string;
}

type Audience = 'all_users' | 'all_network' | 'specific';

export default function AdminMail() {
  const { token } = useAuth();
  const [audience, setAudience] = useState<Audience>('all_users');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bodyType, setBodyType] = useState<BodyType>('markdown');
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  // Specific recipients
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Recipient[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]);
  const [searching, setSearching] = useState(false);

  const searchRecipients = useCallback(async (query: string) => {
    if (!token || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const type = audience === 'all_network' ? 'network' : 'users';
      const res = await fetch(`${API_URL}/mail/recipients?search=${encodeURIComponent(query)}&type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data.filter((r: Recipient) => !selectedRecipients.some(s => s.email === r.email)));
      }
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  }, [token, audience, selectedRecipients]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) searchRecipients(searchQuery);
      else setSearchResults([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchRecipients]);

  const addRecipient = (recipient: Recipient) => {
    setSelectedRecipients(prev => [...prev, recipient]);
    setSearchResults(prev => prev.filter(r => r.email !== recipient.email));
    setSearchQuery('');
  };

  const removeRecipient = (email: string) => {
    setSelectedRecipients(prev => prev.filter(r => r.email !== email));
  };

  const handleSend = async () => {
    if (!token) return;
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required');
      return;
    }
    if (audience === 'specific' && selectedRecipients.length === 0) {
      setError('Please add at least one recipient');
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_URL}/mail/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          audience,
          emails: audience === 'specific' ? selectedRecipients.map(r => r.email) : undefined,
          subject: subject.trim(),
          body: body.trim(),
          bodyType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to send email');
      }

      setSuccess(data.message || `Email sent to ${data.data?.recipientCount} recipient(s)`);
      setConfirmSend(false);
      setSubject('');
      setBody('');
      setSelectedRecipients([]);
      setTimeout(() => setSuccess(null), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const audienceOptions: { value: Audience; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: 'all_users', label: 'All Users', desc: 'Send to all registered users', icon: <Users className="h-5 w-5" /> },
    { value: 'all_network', label: 'All Network', desc: 'Send to verified network members', icon: <Globe className="h-5 w-5" /> },
    { value: 'specific', label: 'Specific Users', desc: 'Search and select individual recipients', icon: <Mail className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Send Mail</h1>
        <p className="text-gray-600">Compose and send themed emails to your community</p>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </motion.div>
      )}

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700"
        >
          <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{success}</p>
        </motion.div>
      )}

      {/* Audience Selector */}
      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-600" />
            Recipients
          </CardTitle>
          <CardDescription>Choose who receives this email</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-3">
            {audienceOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setAudience(opt.value); setSelectedRecipients([]); }}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  audience === opt.value
                    ? 'border-amber-500 bg-amber-50 shadow-sm'
                    : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/50'
                }`}
              >
                <div className={`mb-2 ${audience === opt.value ? 'text-amber-600' : 'text-gray-400'}`}>
                  {opt.icon}
                </div>
                <p className={`font-medium text-sm ${audience === opt.value ? 'text-amber-900' : 'text-gray-700'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* Specific Recipients Search */}
          {audience === 'specific' && (
            <div className="mt-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search users by name or email..."
                  className="pl-10"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-amber-500" />}
              </div>

              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                  {searchResults.map(r => (
                    <button
                      key={r.email}
                      onClick={() => addRecipient(r)}
                      className="w-full px-4 py-2.5 text-left hover:bg-amber-50 flex items-center justify-between text-sm"
                    >
                      <div>
                        <span className="font-medium text-gray-900">{r.name}</span>
                        <span className="text-gray-500 ml-2">{r.email}</span>
                      </div>
                      <span className="text-amber-600 text-xs font-medium">Add</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Recipients */}
              {selectedRecipients.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedRecipients.map(r => (
                    <span
                      key={r.email}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-xs font-medium"
                    >
                      {r.name || r.email}
                      <button onClick={() => removeRecipient(r.email)} className="hover:text-red-600">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compose Email */}
      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-amber-600" />
            Compose
          </CardTitle>
          <CardDescription>Write your email using Markdown or raw HTML</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Subject</label>
            <Input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Email subject line..."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Body</label>
                {/* Markdown / HTML toggle */}
                <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                  <button
                    onClick={() => { setBodyType('markdown'); setShowPreview(false); }}
                    className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${
                      bodyType === 'markdown' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-amber-50'
                    }`}
                  >
                    <FileText className="h-3 w-3" /> MD
                  </button>
                  <button
                    onClick={() => { setBodyType('html'); setShowPreview(false); }}
                    className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${
                      bodyType === 'html' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-amber-50'
                    }`}
                  >
                    <Code className="h-3 w-3" /> HTML
                  </button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs"
              >
                {showPreview ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {showPreview ? 'Edit' : 'Preview'}
              </Button>
            </div>
            {showPreview ? (
              bodyType === 'html' ? (
                <div className="min-h-[200px] border rounded-lg overflow-hidden">
                  <iframe
                    title="HTML Preview"
                    srcDoc={body || '<p style="color:#aaa;padding:16px">Nothing to preview</p>'}
                    className="w-full h-64 border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : (
                <div className="min-h-[200px] p-4 border rounded-lg bg-gray-50 prose prose-sm max-w-none">
                  {body ? <Markdown>{body}</Markdown> : <p className="text-gray-400 italic">Nothing to preview</p>}
                </div>
              )
            ) : (
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                className="w-full min-h-[200px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono"
                placeholder={
                  bodyType === 'html'
                    ? '<h2>Hello!</h2>\n<p>Write your <strong>HTML</strong> email here.</p>'
                    : 'Write your email body in **Markdown**...\n\n- Use **bold** and *italic*\n- Add [links](https://example.com)'
                }
              />
            )}
            <p className="text-xs text-gray-500">
              {bodyType === 'html'
                ? 'HTML will be sanitized before sending — scripts, iframes, and dangerous attributes are stripped.'
                : 'The email will be sent using the premium code.scriet dark theme template.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Send Actions */}
      <div className="flex items-center gap-3 justify-end">
        {!confirmSend ? (
          <Button
            onClick={() => setConfirmSend(true)}
            disabled={!subject.trim() || !body.trim() || (audience === 'specific' && selectedRecipients.length === 0)}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
          >
            <Send className="h-4 w-4 mr-2" />
            Send Email
          </Button>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900 font-medium">
              Send to {audience === 'specific' ? `${selectedRecipients.length} recipient(s)` : audience === 'all_users' ? 'all users' : 'all network members'}?
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmSend(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              Confirm
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
