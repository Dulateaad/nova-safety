import type { DemoUser, Permit } from '../types/domain'
import type { StoredCrewAckSignature } from '../types/crewAck'
import type { EgovSignRole, StoredEgovSignature } from '../types/egovSignature'
import { mergePermitAfterEgovSign } from './approvalSequence'
import { isExecutorCrewAckDone } from './crewAckComplete'
import { assigneeUidForRole, isRoleSigned } from './signatureStatus'
import { resolveUserBadgeNo } from './userBadgeNumbers'
import { FirebaseError } from 'firebase/app'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app, firebaseConfigured } from './firebase'

const REGION = 'europe-west1'
const GOD_CMS = 'R09ELU1PREU=' // base64 "GOD-MODE"

/** Согласующие, которых подписывает GOD MODE (без производителя и ERT). */
export const GOD_MODE_APPROVER_ROLES: EgovSignRole[] = ['issuer', 'permitter', 'leadExpert']

export type GodModeSignSummary = {
  permitId: string
  crewSigned: number
  approversSigned: number
  skippedProducer: boolean
  skippedErt: number
  issued?: boolean
}

function stubEgovSignature(
  role: EgovSignRole,
  uid: string,
  displayName: string,
  documentHash: string,
): StoredEgovSignature {
  return {
    role,
    signedAtIso: new Date().toISOString(),
    signedByUid: uid,
    signedByDisplayName: `${displayName} (GOD MODE)`,
    documentHash,
    cmsBase64: GOD_CMS,
    provider: 'unknown',
    sigexVerified: false,
  }
}

function stubCrewAck(
  uid: string,
  displayName: string,
  documentHash: string,
): StoredCrewAckSignature {
  return {
    signedAtIso: new Date().toISOString(),
    signedByUid: uid,
    signedByDisplayName: `${displayName} (GOD MODE)`,
    documentHash,
    cmsBase64: GOD_CMS,
    provider: 'unknown',
  }
}

function shouldSkipExecutor(
  permit: Permit,
  uid: string,
  resolveUser: (id: string) => DemoUser | undefined,
): boolean {
  if (!uid) return true
  if (uid === permit.performerUid?.trim()) return true
  const role = resolveUser(uid)?.role
  return role === 'ert' || role === 'performer' || role === 'safety'
}

export function godModeCrewAckComplete(
  permit: Permit,
  resolveUser: (id: string) => DemoUser | undefined,
): boolean {
  for (const ex of permit.executors) {
    const uid = ex.userUid?.trim()
    if (!uid || shouldSkipExecutor(permit, uid, resolveUser)) continue
    if (!isExecutorCrewAckDone(permit, uid)) return false
  }
  return true
}

export function godModeApprovalsComplete(permit: Permit): boolean {
  return GOD_MODE_APPROVER_ROLES.every((role) => isRoleSigned(permit, role))
}

/** Выдача наряда после GOD MODE (без подписи производителя и ERT). */
export function issueStatusPatchIfGodModeComplete(
  permit: Permit,
  resolveUser: (id: string) => DemoUser | undefined,
): Partial<Permit> | null {
  if (permit.status !== 'on_approval') return null
  if (!godModeCrewAckComplete(permit, resolveUser)) return null
  if (!godModeApprovalsComplete(permit)) return null
  if (permit.isContractorPermit && !permit.contractorSafetyApproved) return null
  return { status: 'issued' }
}

/** Локальный патч: работники + 3 согласующих (без производителя и ERT). */
export function buildGodModePermitPatch(
  permit: Permit,
  resolveUser: (uid: string) => DemoUser | undefined,
  userDirectory: DemoUser[],
): { patch: Partial<Permit>; summary: Omit<GodModeSignSummary, 'permitId'> } {
  const documentHash = permit.packagePdf?.documentHash ?? 'god-mode'
  const iso = new Date().toISOString()
  const dateIso = iso.slice(0, 10)

  let crewSigned = 0
  let skippedErt = 0
  const crewAckSignatures = { ...(permit.crewAckSignatures ?? {}) }

  const executors = permit.executors.map((ex) => {
    const uid = ex.userUid?.trim()
    if (!uid) return ex
    if (shouldSkipExecutor(permit, uid, resolveUser)) {
      if (resolveUser(uid)?.role === 'ert') skippedErt += 1
      return ex
    }
    if (ex.briefingAcknowledged || crewAckSignatures[uid]?.cmsBase64?.trim()) {
      return ex
    }
    const name = resolveUser(uid)?.displayName ?? uid
    crewAckSignatures[uid] = stubCrewAck(uid, name, documentHash)
    crewSigned += 1
    return {
      ...ex,
      briefingAcknowledged: true,
      dateIso: ex.dateIso || dateIso,
    }
  })

  let merged: Permit = { ...permit, executors, crewAckSignatures }
  let approversSigned = 0

  for (const role of GOD_MODE_APPROVER_ROLES) {
    if (isRoleSigned(merged, role)) continue
    const uid = assigneeUidForRole(merged, role)
    if (!uid) continue
    const name = resolveUser(uid)?.displayName ?? uid
    const sig = stubEgovSignature(role, uid, name, documentHash)
    const resolveBadge = (id: string) => resolveUserBadgeNo(id, userDirectory)
    const part = mergePermitAfterEgovSign(merged, role, sig, resolveBadge)
    merged = { ...merged, ...part }
    approversSigned += 1
  }

  const patch: Partial<Permit> = {
    executors: merged.executors,
    crewAckSignatures: merged.crewAckSignatures,
    egovSignatures: merged.egovSignatures,
    signatures: merged.signatures,
    asor: merged.asor,
    updatedAtIso: iso,
  }

  return {
    patch,
    summary: {
      crewSigned,
      approversSigned,
      skippedProducer: true,
      skippedErt,
    },
  }
}

/** Подписи GOD MODE + автовыдача наряда (локальный / демо режим). */
export function applyGodModeToPermit(
  permit: Permit,
  resolveUser: (uid: string) => DemoUser | undefined,
  userDirectory: DemoUser[],
): { patch: Partial<Permit>; summary: Omit<GodModeSignSummary, 'permitId'> } {
  const { patch, summary } = buildGodModePermitPatch(permit, resolveUser, userDirectory)
  const merged = { ...permit, ...patch } as Permit
  const issuePatch = issueStatusPatchIfGodModeComplete(merged, resolveUser)
  return {
    patch: { ...patch, ...(issuePatch ?? {}) },
    summary: {
      ...summary,
      issued: issuePatch?.status === 'issued',
    },
  }
}

export async function godModeSignPermitClient(
  permitId: string,
): Promise<GodModeSignSummary | null> {
  if (!firebaseConfigured || !app) return null
  const fn = httpsCallable<{ permitId: string }, GodModeSignSummary>(
    getFunctions(app, REGION),
    'godModeSignPermitFn',
  )
  try {
    const res = await fn({ permitId })
    return res.data
  } catch (e) {
    const message =
      e instanceof FirebaseError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'GOD MODE не выполнен'
    throw new Error(message)
  }
}

export function findLatestPermit(permits: Permit[]): Permit | null {
  if (!permits.length) return null
  return [...permits].sort((a, b) => {
    const ca = a.updatedAtIso || a.createdAtIso || ''
    const cb = b.updatedAtIso || b.createdAtIso || ''
    return cb.localeCompare(ca) || b.id.localeCompare(a.id)
  })[0]!
}

export function canUseGodMode(user: DemoUser | null | undefined): boolean {
  return user?.role === 'coordinator'
}
