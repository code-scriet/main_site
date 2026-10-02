import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

function istDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const todayKey = istDateKey();
const qotdDate = new Date(`${todayKey}T00:00:00.000Z`);
const now = new Date();

const problemSlug = 'test-qotd-alternating-parity-streak';
const title = 'Longest Alternating Parity Streak';
const difficulty = 'EASY';
const problemLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qotd/${todayKey}`;

const sampleTests = [
  {
    id: 'sample-full-streak',
    label: 'Entire array alternates',
    input: '6\n5 2 7 10 3 8\n',
    expectedOutput: '6\n',
  },
  {
    id: 'sample-middle-streak',
    label: 'Best streak is in the middle',
    input: '8\n4 8 3 5 2 9 12 14\n',
    expectedOutput: '4\n',
  },
];

const hiddenTests = [
  {
    id: 'hidden-single-value',
    label: 'Single element',
    input: '1\n42\n',
    expectedOutput: '1\n',
    points: 2,
  },
  {
    id: 'hidden-no-alternation',
    label: 'All values share parity',
    input: '5\n2 4 6 8 10\n',
    expectedOutput: '1\n',
    points: 2,
  },
  {
    id: 'hidden-multiple-breaks',
    label: 'Several parity breaks',
    input: '7\n1 2 4 7 6 11 13\n',
    expectedOutput: '4\n',
    points: 3,
  },
  {
    id: 'hidden-longer-case',
    label: 'Longer mixed case',
    input: '12\n9 4 1 6 8 3 10 5 2 7 12 14\n',
    expectedOutput: '6\n',
    points: 3,
  },
];

const body = `## Problem

You are given an array of integers. A contiguous streak is called **alternating** if every pair of neighboring numbers in that streak has different parity: one is odd and the next is even, or one is even and the next is odd.

Find the length of the longest alternating contiguous streak.

## Input Format

- The first line contains an integer \`n\`.
- The second line contains \`n\` space-separated integers.

## Output Format

Print a single integer: the maximum length of an alternating contiguous streak.

## Constraints

- \`1 <= n <= 100000\`
- \`0 <= a[i] <= 10^9\`

## Example

\`\`\`
6
5 2 7 10 3 8
\`\`\`

Output:

\`\`\`
6
\`\`\`

Every adjacent pair alternates parity, so the full array is the answer.`;

const referenceSolution = `n = int(input().strip())
arr = list(map(int, input().split()))

best = 1
current = 1

for i in range(1, n):
    if arr[i] % 2 != arr[i - 1] % 2:
        current += 1
    else:
        current = 1
    best = max(best, current)

print(best)
`;

type ColumnShape = Record<string, string>;

async function getColumnShapes(client: pg.Client): Promise<ColumnShape> {
  const { rows } = await client.query<{
    table_name: string;
    column_name: string;
    udt_name: string;
  }>(`
    select table_name, column_name, udt_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('users', 'problems', 'qotd', 'settings')
  `);
  return Object.fromEntries(rows.map((row) => [`${row.table_name}.${row.column_name}`, row.udt_name]));
}

function enumParam(columnShapes: ColumnShape, key: string, placeholder: string, enumName: string): string {
  return columnShapes[key] === enumName ? `${placeholder}::"${enumName}"` : placeholder;
}

async function resolveCreatorId(client: pg.Client, columnShapes: ColumnShape): Promise<string> {
  const staff = await client.query<{ id: string }>(`
    select id
    from users
    where role::text in ('PRESIDENT', 'ADMIN', 'CORE_MEMBER')
    order by created_at asc
    limit 1
  `);
  if (staff.rows[0]?.id) return staff.rows[0].id;

  const id = randomUUID();
  const roleExpr = enumParam(columnShapes, 'users.role', '$4', 'Role');
  await client.query(
    `
      insert into users (
        id, name, email, role, oauth_provider, oauth_id, avatar, created_at, updated_at
      )
      values (
        $1, $2, $3, ${roleExpr}, $5, $6, $7, $8, $8
      )
    `,
    [
      id,
      'QOTD Tester',
      'qotd-tester@codescriet.local',
      'ADMIN',
      'seed',
      'seed-qotd-tester',
      'https://api.dicebear.com/7.x/initials/svg?seed=QOTD',
      now,
    ],
  );
  return id;
}

async function upsertProblem(client: pg.Client, columnShapes: ColumnShape, creatorId: string): Promise<string> {
  const existing = await client.query<{ id: string }>('select id from problems where slug = $1 order by created_at asc limit 1', [problemSlug]);
  const id = existing.rows[0]?.id ?? randomUUID();
  const difficultyExpr = enumParam(columnShapes, 'problems.difficulty', '$5', 'Difficulty');

  const values = [
    id,
    problemSlug,
    title,
    body,
    difficulty,
    ['arrays', 'parity', 'two-pointers'],
    ['PYTHON', 'JAVASCRIPT', 'CPP', 'JAVA'],
    2000,
    10,
    JSON.stringify(sampleTests),
    JSON.stringify(hiddenTests),
    referenceSolution,
    'PYTHON',
    true,
    creatorId,
    now,
  ];

  if (existing.rows[0]?.id) {
    await client.query(
      `
        update problems
        set
          title = $3,
          body = $4,
          difficulty = ${difficultyExpr},
          tags = $6::text[],
          allowed_languages = $7::"ProblemLanguage"[],
          time_limit_ms = $8,
          default_submit_cap = $9,
          sample_tests = $10::jsonb,
          hidden_tests = $11::jsonb,
          reference_solution = $12,
          reference_language = $13::"ProblemLanguage",
          is_published = $14,
          created_by = $15,
          test_cases_updated_at = $16,
          updated_at = $16
        where id = $1
      `,
      values,
    );
    return id;
  }

  await client.query(
    `
      insert into problems (
        id, slug, title, body, difficulty, tags, allowed_languages,
        time_limit_ms, default_submit_cap, sample_tests, hidden_tests,
        reference_solution, reference_language, is_published, created_by,
        test_cases_updated_at, created_at, updated_at
      )
      values (
        $1, $2, $3, $4, ${difficultyExpr}, $6::text[], $7::"ProblemLanguage"[],
        $8, $9, $10::jsonb, $11::jsonb,
        $12, $13::"ProblemLanguage", $14, $15,
        $16, $16, $16
      )
    `,
    values,
  );
  return id;
}

async function upsertQotd(client: pg.Client, columnShapes: ColumnShape, creatorId: string, problemId: string): Promise<string> {
  const existing = await client.query<{ id: string }>('select id from qotd where date = $1 order by created_at asc limit 1', [qotdDate]);
  const id = existing.rows[0]?.id ?? randomUUID();
  const difficultyExpr = enumParam(columnShapes, 'qotd.difficulty', '$4', 'Difficulty');

  if (existing.rows[0]?.id) {
    await client.query(
      `
        update qotd
        set
          question = $2,
          problem_link = $3,
          difficulty = ${difficultyExpr},
          created_by_id = $5,
          problem_id = $6,
          held_by = null,
          hold_reason = null,
          is_published = true,
          publish_at = $7,
          published_at = $7
        where id = $1
      `,
      [id, title, problemLink, difficulty, creatorId, problemId, now],
    );
    return id;
  }

  await client.query(
    `
      insert into qotd (
        id, date, question, problem_link, difficulty, created_by_id,
        problem_id, is_published, publish_at, published_at, created_at
      )
      values (
        $1, $2, $3, $4, ${enumParam(columnShapes, 'qotd.difficulty', '$5', 'Difficulty')}, $6,
        $7, true, $8, $8, $8
      )
    `,
    [id, qotdDate, title, problemLink, difficulty, creatorId, problemId, now],
  );
  return id;
}

async function enableLocalFeatureFlags(client: pg.Client, columnShapes: ColumnShape): Promise<void> {
  const enabledColumns = [
    columnShapes['settings.problems_enabled'] ? 'problems_enabled = true' : null,
    columnShapes['settings.playground_enabled'] ? 'playground_enabled = true' : null,
    columnShapes['settings.show_qotd'] ? 'show_qotd = true' : null,
  ].filter(Boolean);

  if (enabledColumns.length === 0) return;

  await client.query(`
    update settings
    set ${enabledColumns.join(', ')}
    where id = 'default'
  `);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    console.log(`Seeding test QOTD for ${todayKey}...`);
    const columnShapes = await getColumnShapes(client);
    const creatorId = await resolveCreatorId(client, columnShapes);
    const problemId = await upsertProblem(client, columnShapes, creatorId);
    const qotdId = await upsertQotd(client, columnShapes, creatorId, problemId);
    await enableLocalFeatureFlags(client, columnShapes);

    console.log('Seeded test QOTD:');
    console.log({
      qotdId,
      date: todayKey,
      problemId,
      problemSlug,
      title,
      solveUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/qotd/today`,
      playgroundUrl: `${process.env.VITE_PLAYGROUND_URL || 'http://localhost:5174'}/?qotd=today`,
    });
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Failed to seed test QOTD:', error);
  process.exitCode = 1;
});
