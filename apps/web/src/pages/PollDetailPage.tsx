import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Share2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, type Poll } from '@/lib/api';
import { formatDateTime } from '@/lib/dateUtils';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

export default function PollDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user } = useAuth();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [submittingVote, setSubmittingVote] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const loadPoll = async () => {
      if (!slug) {
        setError('Poll not found');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await api.getPoll(slug, token ?? undefined);
        setPoll(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load poll');
      } finally {
        setLoading(false);
      }
    };

    void loadPoll();
  }, [slug, token]);

  useEffect(() => {
    setSelectedOptionIds(poll?.currentUserVote?.optionIds ?? []);
    setFeedbackMessage(poll?.currentUserFeedback?.message ?? '');
  }, [poll?.currentUserVote, poll?.currentUserFeedback]);

  const nextPath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.pathname, location.search, location.hash],
  );

  const loginHref = `/signin?next=${encodeURIComponent(nextPath)}`;

  const handleOptionToggle = (optionId: string) => {
    if (!poll || poll.isClosed || !user) return;

    setSelectedOptionIds((current) => {
      if (!poll.allowMultipleChoices) {
        return current[0] === optionId ? [] : [optionId];
      }

      return current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
    });
  };

  const handleVoteSubmit = async () => {
    if (!poll || !slug || !token) return;
    if (selectedOptionIds.length === 0) {
      toast.error('Select at least one option before submitting.');
      return;
    }

    try {
      setSubmittingVote(true);
      const updatedPoll = await api.voteOnPoll(slug, selectedOptionIds, token);
      setPoll(updatedPoll);
      toast.success(poll.currentUserVote ? 'Vote updated.' : 'Vote submitted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit vote');
    } finally {
      setSubmittingVote(false);
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!poll || !slug || !token) return;
    if (!feedbackMessage.trim()) {
      toast.error('Write your thoughts before submitting.');
      return;
    }

    try {
      setSubmittingFeedback(true);
      const feedback = await api.submitPollFeedback(slug, feedbackMessage.trim(), token);
      setPoll((current) =>
        current
          ? {
              ...current,
              currentUserFeedback: feedback,
              totalFeedback: current.currentUserFeedback ? current.totalFeedback : current.totalFeedback + 1,
            }
          : current,
      );
      toast.success('Your thoughts were saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save feedback');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleShare = async () => {
    if (!poll) return;

    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({
          title: poll.question,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Poll link copied.');
      }
    } catch {
      // Ignore share dismissals.
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <section className="min-h-screen bg-stone-50 px-4 py-16">
          <div className="mx-auto flex max-w-5xl items-center justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
          </div>
        </section>
      </Layout>
    );
  }

  if (error || !poll) {
    return (
      <Layout>
        <SEO title="Poll Not Found" noIndex={true} />
        <section className="min-h-screen bg-stone-50 px-4 py-16">
          <div className="mx-auto max-w-3xl">
            <Card className="border-red-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-red-700">Poll Not Found</CardTitle>
                <CardDescription className="text-red-600">
                  {error || 'The poll you are looking for is unavailable.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => navigate('/announcements')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to announcements
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </Layout>
    );
  }

  const voteDisabled =
    poll.isClosed ||
    !user ||
    selectedOptionIds.length === 0 ||
    (Boolean(poll.currentUserVote) && !poll.allowVoteChange);

  return (
    <Layout>
      <SEO
        title={poll.question}
        description={poll.description || 'Vote in the latest code.scriet community poll.'}
        url={`/polls/${poll.slug}`}
      />

      <section className="min-h-screen bg-stone-50 py-10 sm:py-14">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare} disabled={sharing}>
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          </div>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="space-y-4 border-b border-gray-100 pb-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={poll.isClosed ? 'secondary' : 'success'}>
                  {poll.isClosed ? 'Poll closed' : 'Poll open'}
                </Badge>
                <Badge variant="outline">
                  {poll.allowMultipleChoices ? 'Multiple choice' : 'Single choice'}
                </Badge>
                {poll.allowVoteChange ? (
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    Vote changes allowed
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    One final submission
                  </Badge>
                )}
                {poll.isAnonymous && (
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Anonymous voting
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                <CardTitle className="text-2xl leading-tight text-gray-950 sm:text-4xl">
                  {poll.question}
                </CardTitle>
                {poll.description && (
                  <CardDescription className="max-w-3xl text-base leading-7 text-gray-600">
                    {poll.description}
                  </CardDescription>
                )}
              </div>

              <div className="grid gap-3 text-sm text-gray-600 sm:grid-cols-3">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <Users className="h-4 w-4 text-amber-600" />
                  <span>{poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <MessageSquare className="h-4 w-4 text-amber-600" />
                  <span>{poll.totalFeedback} thought{poll.totalFeedback === 1 ? '' : 's'}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <CalendarClock className="h-4 w-4 text-amber-600" />
                  <span>{poll.deadline ? formatDateTime(poll.deadline) : 'No deadline set'}</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="space-y-3">
                  {poll.options.map((option) => {
                    const isSelected = selectedOptionIds.includes(option.id);

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleOptionToggle(option.id)}
                        disabled={poll.isClosed || !user}
                        className={cn(
                          'w-full rounded-xl border px-4 py-4 text-left transition-colors',
                          isSelected
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-gray-200 bg-white hover:border-amber-200 hover:bg-amber-50/40',
                          (poll.isClosed || !user) && 'cursor-default',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold',
                                  isSelected
                                    ? 'border-amber-500 bg-amber-500 text-white'
                                    : 'border-gray-300 text-gray-500',
                                )}
                              >
                                {poll.allowMultipleChoices ? (isSelected ? '✓' : '+') : isSelected ? '●' : '○'}
                              </span>
                              <span className={cn('text-base text-gray-900', isSelected && 'font-semibold')}>
                                {option.text}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-sm text-gray-500">
                            <div className="font-medium text-gray-900">{option.percentage}%</div>
                            <div>{option.voteCount} vote{option.voteCount === 1 ? '' : 's'}</div>
                          </div>
                        </div>

                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={cn(
                              'h-full rounded-full transition-[width] duration-300',
                              isSelected ? 'bg-amber-500' : 'bg-amber-300',
                            )}
                            style={{ width: `${Math.max(option.percentage, option.voteCount > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {poll.currentUserVote && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <div className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      Your vote is saved.
                    </div>
                    <p className="mt-1 text-emerald-700">
                      Last updated {formatDateTime(poll.currentUserVote.updatedAt)}.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <Card className="border-gray-200 shadow-none">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-lg text-gray-950">Cast your vote</CardTitle>
                    <CardDescription>
                      {poll.isClosed
                        ? 'Voting has ended for this poll.'
                        : user
                          ? poll.allowMultipleChoices
                            ? 'Select one or more options, then submit.'
                            : 'Select one option, then submit.'
                          : 'Sign in to vote and submit feedback.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!user ? (
                      <Link to={loginHref} className="block">
                        <Button className="w-full">Sign in to vote</Button>
                      </Link>
                    ) : (
                      <>
                        <Button
                          className="w-full"
                          onClick={handleVoteSubmit}
                          disabled={voteDisabled || submittingVote}
                        >
                          {submittingVote ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving vote
                            </>
                          ) : poll.currentUserVote ? (
                            'Update vote'
                          ) : (
                            'Submit vote'
                          )}
                        </Button>
                        {poll.currentUserVote && !poll.allowVoteChange && (
                          <p className="text-xs text-gray-500">
                            Vote changes are disabled for this poll.
                          </p>
                        )}
                        {poll.isAnonymous ? (
                          <p className="text-xs text-gray-500">
                            Voting stays anonymous. Admins only see totals, not who picked each option.
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500">
                            This is a named poll. Admins can review who voted for which option.
                          </p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-gray-200 shadow-none">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-lg text-gray-950">Submit Your Thoughts</CardTitle>
                    <CardDescription>
                      Share feedback, context, or suggestions related to this poll.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!user ? (
                      <Link to={loginHref} className="block">
                        <Button variant="outline" className="w-full">
                          Sign in to leave feedback
                        </Button>
                      </Link>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="poll-feedback">Your message</Label>
                          <Textarea
                            id="poll-feedback"
                            value={feedbackMessage}
                            onChange={(event) => setFeedbackMessage(event.target.value)}
                            placeholder="Tell us what you think, what you'd pick instead, or any suggestion that helps."
                            rows={6}
                          />
                        </div>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={handleFeedbackSubmit}
                          disabled={submittingFeedback || !feedbackMessage.trim()}
                        >
                          {submittingFeedback ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving thoughts
                            </>
                          ) : poll.currentUserFeedback ? (
                            'Update feedback'
                          ) : (
                            'Save feedback'
                          )}
                        </Button>
                        <p className="text-xs text-gray-500">
                          Feedback is tied to your account so admins can follow up when needed.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </Layout>
  );
}
