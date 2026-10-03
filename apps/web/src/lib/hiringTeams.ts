// Canonical hiring teams + the optional questions each team asks on the
// application form. Single source of truth for the candidate form (JoinUsPage)
// and the dashboard "My Application" editor, so labels never drift apart.
// IDs mirror the ApplyingRole enum in prisma/schema.prisma.

export type HiringTeamId =
  | 'TECHNICAL'
  | 'DSA_CHAMPS'
  | 'DESIGNING'
  | 'SOCIAL_MEDIA'
  | 'MANAGEMENT';

export const HIRING_TEAMS: HiringTeamId[] = [
  'TECHNICAL',
  'DSA_CHAMPS',
  'DESIGNING',
  'SOCIAL_MEDIA',
  'MANAGEMENT',
];

export const TEAM_LABEL: Record<HiringTeamId, string> = {
  TECHNICAL: 'Technical',
  DSA_CHAMPS: 'DSA Champs',
  DESIGNING: 'Designing',
  SOCIAL_MEDIA: 'Social Media',
  MANAGEMENT: 'Management',
};

export function teamLabel(role: string): string {
  return TEAM_LABEL[role as HiringTeamId] ?? role.replace(/_/g, ' ');
}

export interface TeamQuestion {
  /** Stored in HiringApplication.teamQuestion1 / teamQuestion2. */
  key: 'teamQuestion1' | 'teamQuestion2';
  label: string;
  placeholder: string;
}

// One or two team-specific questions per team. All optional — never block a submission.
const TEAM_QUESTIONS: Record<HiringTeamId, TeamQuestion[]> = {
  TECHNICAL: [
    { key: 'teamQuestion1', label: 'A project you are proud of', placeholder: 'What did you build, and what was your part?' },
    { key: 'teamQuestion2', label: 'Stack you want to build with', placeholder: 'e.g. React, Node, Python, ML…' },
  ],
  DSA_CHAMPS: [
    { key: 'teamQuestion1', label: 'Your current DSA level', placeholder: 'Topics you are comfortable with, contests you have done' },
    { key: 'teamQuestion2', label: 'A problem that excited you', placeholder: 'Which problem, and why did you enjoy it?' },
  ],
  DESIGNING: [
    { key: 'teamQuestion1', label: 'Where can we see your work?', placeholder: 'Portfolio, Behance, Dribbble or past posters' },
    { key: 'teamQuestion2', label: 'Which tools do you design in?', placeholder: 'e.g. Figma, Photoshop, Illustrator' },
  ],
  SOCIAL_MEDIA: [
    { key: 'teamQuestion1', label: 'Content you have created', placeholder: 'Handles, reels, or posts you have run' },
    { key: 'teamQuestion2', label: 'A campaign idea for the club', placeholder: 'One idea to grow code.scriet on social' },
  ],
  MANAGEMENT: [
    { key: 'teamQuestion1', label: 'Have you organised an event before?', placeholder: 'What, and how did it go?' },
    { key: 'teamQuestion2', label: 'How would you handle a last-minute change?', placeholder: 'A speaker cancels an hour before — what do you do?' },
  ],
};

export function teamQuestionsFor(role: string | null | undefined): TeamQuestion[] {
  if (!role) return [];
  return TEAM_QUESTIONS[role as HiringTeamId] ?? [];
}
