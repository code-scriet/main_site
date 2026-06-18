import type { AdminPollDetail, PollInput } from '@/lib/api';

export type ListStatusFilter = 'ALL' | 'OPEN' | 'CLOSED' | 'DRAFT';
export type ListAnonymityFilter = 'ALL' | 'ANONYMOUS' | 'NAMED';
export type DetailTab = 'overview' | 'responses' | 'feedback' | 'editor';
export type ResponseSort = 'NEWEST' | 'OLDEST';
export type FeedbackSort = 'NEWEST' | 'OLDEST' | 'LONGEST';
export type FeedbackLengthFilter = 'ALL' | 'SHORT' | 'MEDIUM' | 'LONG';
export type PollType = 'NORMAL' | 'QUESTION';

export const STATUS_TABS: ListStatusFilter[] = ['ALL', 'OPEN', 'CLOSED', 'DRAFT'];
export const ANONYMITY_TABS: ListAnonymityFilter[] = ['ALL', 'ANONYMOUS', 'NAMED'];

export const EMPTY_POLL_FORM: PollInput = {
  question: '',
  description: '',
  options: ['', ''],
  allowMultipleChoices: false,
  allowVoteChange: true,
  isAnonymous: false,
  deadline: '',
  isPublished: true,
  eventId: '',
};

type PollResponse = AdminPollDetail['responses'][number];
type PollFeedback = AdminPollDetail['feedback'][number];

export interface ResponseFilterArgs {
  responses: PollResponse[];
  search: string;
  roleFilter: string;
  optionFilter: string;
  sort: ResponseSort;
}

export const filterAndSortResponses = ({
  responses,
  search,
  roleFilter,
  optionFilter,
  sort,
}: ResponseFilterArgs): PollResponse[] => {
  const query = search.trim().toLowerCase();
  const filtered = responses.filter((response) => {
    if (roleFilter !== 'ALL' && response.user.role !== roleFilter) return false;
    if (optionFilter !== 'ALL' && !response.optionIds.includes(optionFilter)) return false;
    if (!query) return true;
    return `${response.user.name} ${response.user.email} ${response.user.role} ${response.optionLabels.join(' ')}`
      .toLowerCase()
      .includes(query);
  });
  return [...filtered].sort((left, right) => {
    if (sort === 'OLDEST') {
      return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
};

export interface FeedbackFilterArgs {
  feedback: PollFeedback[];
  search: string;
  roleFilter: string;
  lengthFilter: FeedbackLengthFilter;
  sort: FeedbackSort;
}

export const filterAndSortFeedback = ({
  feedback,
  search,
  roleFilter,
  lengthFilter,
  sort,
}: FeedbackFilterArgs): PollFeedback[] => {
  const query = search.trim().toLowerCase();
  const filtered = feedback.filter((entry) => {
    if (roleFilter !== 'ALL' && entry.user.role !== roleFilter) return false;
    const messageLength = entry.message.trim().length;
    if (lengthFilter === 'SHORT' && messageLength > 120) return false;
    if (lengthFilter === 'MEDIUM' && (messageLength <= 120 || messageLength > 350)) return false;
    if (lengthFilter === 'LONG' && messageLength <= 350) return false;
    if (!query) return true;
    return `${entry.user.name} ${entry.user.email} ${entry.user.role} ${entry.message}`
      .toLowerCase()
      .includes(query);
  });
  return [...filtered].sort((left, right) => {
    if (sort === 'OLDEST') {
      return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
    }
    if (sort === 'LONGEST') {
      return right.message.trim().length - left.message.trim().length;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
};
