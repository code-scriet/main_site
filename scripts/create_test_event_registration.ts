import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import { makePrismaClient } from './prismaClient.js';
import { generateAttendanceToken } from '../apps/api/src/utils/attendanceToken.js';

const prisma = makePrismaClient();

const TEST_USERS = [
  { email: 'lp.hindustan@gmail.com', name: 'LP Hindustan', branch: 'CSE', course: 'B.Tech', year: '2nd' },
  { email: 'test.attendee1@code.scriet', name: 'Aditi Sharma', branch: 'IT', course: 'B.Tech', year: '3rd' },
  { email: 'test.attendee2@code.scriet', name: 'Rohan Mehta', branch: 'ECE', course: 'B.Tech', year: '1st' },
];

async function main() {
  const password = await bcrypt.hash('password123', 12);

  const creator = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'PRESIDENT'] } },
    orderBy: { createdAt: 'asc' },
  });
  if (!creator) {
    throw new Error('No ADMIN/PRESIDENT user found in the DB to own the test event.');
  }

  const users = [];
  for (const def of TEST_USERS) {
    const user = await prisma.user.upsert({
      where: { email: def.email },
      update: {},
      create: {
        name: def.name,
        email: def.email,
        password,
        role: 'USER',
        profileCompleted: true,
        branch: def.branch,
        course: def.course,
        year: def.year,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(def.name)}`,
      },
    });
    users.push(user);
  }

  const now = Date.now();
  const event = await prisma.event.upsert({
    where: { slug: 'dummy-test-event' },
    update: {},
    create: {
      title: 'Dummy Test Event',
      slug: 'dummy-test-event',
      description: 'A dummy event created for local testing of registrations, attendance, and the registrant composer.',
      shortDescription: 'Local testing event with seeded registrants.',
      status: 'UPCOMING',
      startDate: new Date(now + 3 * 24 * 60 * 60 * 1000),
      endDate: new Date(now + 3 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
      registrationStartDate: new Date(now - 24 * 60 * 60 * 1000),
      registrationEndDate: new Date(now + 2 * 24 * 60 * 60 * 1000),
      location: 'CCSU Campus, Meerut',
      venue: 'Seminar Hall 2',
      capacity: 50,
      eventType: 'Workshop',
      createdBy: creator.id,
      tags: ['test', 'dummy'],
    },
  });

  for (const user of users) {
    const existing = await prisma.eventRegistration.findUnique({
      where: { userId_eventId: { userId: user.id, eventId: event.id } },
    });
    if (existing) {
      console.info(`Already registered: ${user.email}`);
      continue;
    }

    const registrationId = randomUUID();
    const attendanceToken = generateAttendanceToken(user.id, event.id, registrationId);

    await prisma.$transaction([
      prisma.eventRegistration.create({
        data: {
          id: registrationId,
          userId: user.id,
          eventId: event.id,
          registrationType: 'PARTICIPANT',
          attendanceToken,
        },
      }),
      prisma.dayAttendance.create({
        data: { registrationId, dayNumber: 1, attended: false },
      }),
    ]);

    console.info(`Registered ${user.email} for "${event.title}"`);
  }

  console.info('\n--- Summary ---');
  console.info(`Event: ${event.title}`);
  console.info(`  slug: ${event.slug}`);
  console.info(`  id: ${event.id}`);
  console.info('Registered users (password: password123):');
  for (const u of users) {
    console.info(`  - ${u.name} <${u.email}>`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
