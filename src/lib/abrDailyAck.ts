import type { DemoUser, Permit } from '../types/domain'
import type { AbrDailyAckDay, AbrDailyAckEntry } from '../types/abrDailyAck'
import { emptyAbrDailyAckDay } from '../types/abrDailyAck'

const ACTIVE = new Set<Permit['status']>(['issued', 'in_progress', 'suspended'])

/** Подпись действительна 24 часа с момента подписания. */
export const ABR_DAILY_ACK_VALID_MS = 24 * 60 * 60 * 1000

export function todayDateIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function normalizeAbrDailyAcks(raw: unknown): AbrDailyAckDay[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((day) => {
      if (!day || typeof day !== 'object') return null
      const d = day as Partial<AbrDailyAckDay>
      const dateIso = String(d.dateIso ?? '').slice(0, 10)
      if (!dateIso) return null
      const entries: AbrDailyAckEntry[] = Array.isArray(d.entries)
        ? d.entries
            .map((e): AbrDailyAckEntry | null => {
              if (!e || typeof e !== 'object') return null
              const x = e as Partial<AbrDailyAckEntry>
              const userUid = String(x.userUid ?? '').trim()
              if (!userUid) return null
              const entry: AbrDailyAckEntry = {
                userUid,
                fullName: String(x.fullName ?? '').trim(),
                roleLabel: String(x.roleLabel ?? 'Работник').trim(),
                signedAtIso: String(x.signedAtIso ?? new Date().toISOString()),
                signatureNote: String(x.signatureNote ?? 'Ознакомлен').trim(),
              }
              if (typeof x.cmsBase64 === 'string' && x.cmsBase64.trim()) {
                entry.cmsBase64 = x.cmsBase64.trim()
              }
              if (typeof x.signerIin === 'string' || x.signerIin === null) {
                entry.signerIin = x.signerIin
              }
              if (typeof x.documentHash === 'string' && x.documentHash.trim()) {
                entry.documentHash = x.documentHash.trim()
              }
              if (x.provider === 'egov_mobile' || x.provider === 'manual') {
                entry.provider = x.provider
              }
              return entry
            })
            .filter((x): x is AbrDailyAckEntry => x !== null)
        : []
      return { dateIso, entries } satisfies AbrDailyAckDay
    })
    .filter((x): x is AbrDailyAckDay => x !== null)
}

export function abrDailyAckForDate(
  permit: Permit,
  dateIso = todayDateIso(),
): AbrDailyAckDay {
  const list = normalizeAbrDailyAcks(permit.abrDailyAcks)
  return list.find((d) => d.dateIso === dateIso) ?? emptyAbrDailyAckDay(dateIso)
}

export function latestAbrDailyAckForUser(
  permit: Permit,
  userUid: string,
): AbrDailyAckEntry | undefined {
  const uid = userUid.trim()
  if (!uid) return undefined
  return normalizeAbrDailyAcks(permit.abrDailyAcks)
    .flatMap((day) => day.entries)
    .filter((e) => e.userUid === uid)
    .sort((a, b) => b.signedAtIso.localeCompare(a.signedAtIso))[0]
}

export function hasValidAbrDailyAck(permit: Permit, userUid: string): boolean {
  const latest = latestAbrDailyAckForUser(permit, userUid)
  if (!latest) return false
  const signedAt = new Date(latest.signedAtIso).getTime()
  if (!Number.isFinite(signedAt)) return false
  return Date.now() - signedAt < ABR_DAILY_ACK_VALID_MS
}

/** Подпись действительна в течение 24 часов с момента подписания. */
export function hasAbrDailyAckToday(permit: Permit, userUid: string): boolean {
  return hasValidAbrDailyAck(permit, userUid)
}

export function mergeAbrDailyAckEntry(
  permit: Permit,
  entry: AbrDailyAckEntry,
  dateIso = todayDateIso(),
): AbrDailyAckDay[] {
  const list = normalizeAbrDailyAcks(permit.abrDailyAcks)
  const idx = list.findIndex((d) => d.dateIso === dateIso)
  const day = idx >= 0 ? list[idx]! : emptyAbrDailyAckDay(dateIso)
  const entries = [...day.entries, entry]
  const nextDay = { dateIso, entries }
  if (idx >= 0) {
    const copy = [...list]
    copy[idx] = nextDay
    return copy
  }
  return [...list, nextDay].sort((a, b) => a.dateIso.localeCompare(b.dateIso))
}

export function buildAbrDailyAckEntry(
  actor: DemoUser,
  resolveRoleLabel: (user: DemoUser) => string,
  opts?: {
    cmsBase64?: string
    signerIin?: string | null
    documentHash?: string
    provider?: AbrDailyAckEntry['provider']
  },
): AbrDailyAckEntry {
  const signedAtIso = new Date().toISOString()
  const when = new Date(signedAtIso).toLocaleString('ru-RU')
  const egov = Boolean(opts?.cmsBase64?.trim())
  return {
    userUid: actor.id,
    fullName: actor.displayName,
    roleLabel: resolveRoleLabel(actor),
    signedAtIso,
    signatureNote: egov ? `ЭЦП eGov Mobile · ${when}` : `Ознакомлен · ${when}`,
    cmsBase64: opts?.cmsBase64?.trim() || undefined,
    signerIin: opts?.signerIin,
    documentHash: opts?.documentHash,
    provider: opts?.provider ?? (egov ? 'egov_mobile' : 'manual'),
  }
}

export function isAbrDailyAckPeriodActive(status: Permit['status']): boolean {
  return ACTIVE.has(status)
}

export function pendingAbrDailyAckUids(permit: Permit, _dateIso = todayDateIso()): string[] {
  if (!isAbrDailyAckPeriodActive(permit.status)) return []
  return permit.executors
    .map((ex) => ex.userUid.trim())
    .filter((uid) => uid && !hasValidAbrDailyAck(permit, uid))
}

export function pendingAbrDailyAckPermitsForUser(
  permits: Permit[],
  userUid: string,
): Permit[] {
  const uid = userUid.trim()
  if (!uid) return []
  return permits.filter((p) => {
    if (!p.executors.some((ex) => ex.userUid === uid)) return false
    return pendingAbrDailyAckUids(p).includes(uid)
  })
}
