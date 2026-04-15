import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const REGISTRATION_BATCH_SIZE = 100;
const INSERT_BATCH_SIZE = 100;

type RegistrationWithEventDays = {
  id: string;
  attended: boolean;
  scannedAt: Date | null;
  manualOverride: boolean;
  event: {
    eventDays: number;
  } | null;
};

async function flushInsertBuffer(
  buffer: Array<{
    registrationId: string;
    dayNumber: number;
    attended: boolean;
    scannedAt: Date | null;
    scannedBy: string | null;
    manualOverride: boolean;
  }>,
): Promise<void> {
  if (buffer.length === 0) return;

  await prisma.dayAttendance.createMany({
    data: buffer.splice(0, buffer.length),
    skipDuplicates: true,
  });
}

function normalizeEventDays(value: number | null | undefined): number {
  if (!Number.isInteger(value) || !value || value < 1) return 1;
  if (value > 10) return 10;
  return value;
}

async function main() {
  const total = await prisma.eventRegistration.count();
  console.log(`Starting day-attendance backfill for ${total} registrations`);

  let processed = 0;
  let lastId: string | undefined;
  const insertBuffer: Array<{
    registrationId: string;
    dayNumber: number;
    attended: boolean;
    scannedAt: Date | null;
    scannedBy: string | null;
    manualOverride: boolean;
  }> = [];

  while (true) {
    const registrations = await prisma.eventRegistration.findMany({
      take: REGISTRATION_BATCH_SIZE,
      ...(lastId
        ? {
            skip: 1,
            cursor: { id: lastId },
          }
        : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        attended: true,
        scannedAt: true,
        manualOverride: true,
        event: {
          select: {
            eventDays: true,
          },
        },
      },
    }) as RegistrationWithEventDays[];

    if (registrations.length === 0) break;

    for (const registration of registrations) {
      const eventDays = normalizeEventDays(registration.event?.eventDays);

      if (eventDays === 1) {
        insertBuffer.push({
          registrationId: registration.id,
          dayNumber: 1,
          attended: registration.attended,
          scannedAt: registration.scannedAt,
          scannedBy: null,
          manualOverride: registration.manualOverride,
        });
      } else {
        for (let dayNumber = 1; dayNumber <= eventDays; dayNumber += 1) {
          insertBuffer.push({
            registrationId: registration.id,
            dayNumber,
            attended: false,
            scannedAt: null,
            scannedBy: null,
            manualOverride: false,
          });
        }
      }

      while (insertBuffer.length >= INSERT_BATCH_SIZE) {
        await prisma.dayAttendance.createMany({
          data: insertBuffer.splice(0, INSERT_BATCH_SIZE),
          skipDuplicates: true,
        });
      }
    }

    processed += registrations.length;
    lastId = registrations[registrations.length - 1]?.id;
    console.log(`Migrated ${processed} of ${total} registrations`);
  }

  await flushInsertBuffer(insertBuffer);
  console.log(`Backfill complete. Migrated ${processed} of ${total} registrations`);
}

main()
  .catch((error) => {
    console.error('Failed to backfill day attendance');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
