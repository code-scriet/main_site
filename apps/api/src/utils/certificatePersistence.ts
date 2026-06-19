// Certificate persistence resilience — the write helpers + error predicates that
// keep certificate create/update working across two failure modes shared by every
// certificate-writing flow (issuance, edit, revoke, bulk):
//
//   1. Schema drift (P2022): a deploy may be ahead of the DB migration, so a write
//      that references newer columns (signatory snapshot, email-template fields) is
//      retried with the legacy column set only.
//   2. certId collision (P2002 on cert_id): the random certId hit an existing row;
//      the issuance retry loop regenerates and tries again.
//
// Lives apart from certificateIssuance.ts on purpose: delete / revoke / edit
// endpoints need the schema-fallback writers but are NOT issuance, so neither side
// should import "issuance" to do a non-issuance write.

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../utils/logger.js';

/** P2022 — a referenced column does not exist (deploy ahead of migration). */
export const isCertificateSchemaDriftError = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022';

/** Lower-cased unique-constraint target columns from a P2002, or [] for anything else. */
export function getUniqueConstraintTargets(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return [];
  }

  const rawTarget = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(rawTarget)) {
    return rawTarget.map((value) => String(value).toLowerCase());
  }
  if (typeof rawTarget === 'string') {
    return [rawTarget.toLowerCase()];
  }
  return [];
}

/** True when a P2002 collided specifically on the certId column. */
export function isCertificateIdCollisionError(error: unknown): boolean {
  const targets = getUniqueConstraintTargets(error);
  return targets.some((target) => target.includes('cert_id') || target.includes('certid'));
}

export async function createCertificateWithSchemaFallback(
  certId: string,
  fullData: Prisma.CertificateUncheckedCreateInput,
  legacyData: Prisma.CertificateUncheckedCreateInput,
) {
  try {
    return await prisma.certificate.create({ data: fullData });
  } catch (error) {
    if (!isCertificateSchemaDriftError(error)) {
      throw error;
    }

    logger.warn('Certificate schema drift detected during create; retrying with legacy columns only', { certId });
    return prisma.certificate.create({ data: legacyData });
  }
}

/**
 * Read a certificate's persisted team name, tolerating an un-migrated DB.
 *
 * team_name is an additive column (migration 20260619000000). On an instance
 * where the migration hasn't applied yet, selecting it throws P2022; we degrade
 * to null rather than fail the regeneration. Keeps the team_name feature
 * non-mandatory — same philosophy as the schema-fallback writers above.
 */
export async function readCertificateTeamName(certId: string): Promise<string | null> {
  try {
    const row = await prisma.certificate.findUnique({
      where: { certId },
      select: { teamName: true },
    });
    return row?.teamName ?? null;
  } catch (error) {
    if (isCertificateSchemaDriftError(error)) {
      return null;
    }
    throw error;
  }
}

export async function updateCertificateWithSchemaFallback(
  certId: string,
  fullData: Prisma.CertificateUncheckedUpdateInput,
  legacyData: Prisma.CertificateUncheckedUpdateInput,
) {
  try {
    return await prisma.certificate.update({
      where: { certId },
      data: fullData,
    });
  } catch (error) {
    if (!isCertificateSchemaDriftError(error)) {
      throw error;
    }

    logger.warn('Certificate schema drift detected during update; retrying with legacy columns only', { certId });
    return prisma.certificate.update({
      where: { certId },
      data: legacyData,
    });
  }
}
