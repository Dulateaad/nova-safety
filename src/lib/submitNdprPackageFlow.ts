import type { NavigateFunction } from 'react-router-dom'
import type { DemoUser, Permit, PermitDraft } from '../types/domain'
import type { AsorForm } from '../types/asor'
import type { PprForm } from '../types/ppr'
import { clearPackageSession } from './packageSession'
import {
  packageDraftToPermitFields,
  readResumePermitId,
  clearResumePermitId,
  writeResumePermitId,
} from './resumePermitPackage'

function isPermitNotFoundError(e: unknown): boolean {
  return e instanceof Error && e.message === 'Permit not found'
}

/** Обновляет черновик по resume-id или создаёт новый наряд, если id устарел. */
export async function ensurePermitForPackageSubmit(args: {
  packageDraft: PermitDraft
  createPermit: (draft: PermitDraft) => Promise<Permit>
  updatePermit: (id: string, patch: Partial<Permit>) => Promise<void>
}): Promise<Permit> {
  const { packageDraft, createPermit, updatePermit } = args
  const resumePermitId = readResumePermitId()
  if (resumePermitId) {
    try {
      await updatePermit(resumePermitId, packageDraftToPermitFields(packageDraft))
      return { id: resumePermitId, ...packageDraft } as Permit
    } catch (e) {
      if (!isPermitNotFoundError(e)) throw e
      clearResumePermitId()
    }
  }
  const created = await createPermit(packageDraft)
  writeResumePermitId(created.id)
  return created
}

export type SubmitPackageDeps = {
  packageDraft: PermitDraft
  createPermit: (draft: PermitDraft) => Promise<Permit>
  updatePermit: (id: string, patch: Partial<Permit>) => Promise<void>
  transition: (id: string, status: Permit['status']) => Promise<void>
  resolveUser: (uid: string) => DemoUser | undefined
  userDirectory: DemoUser[]
  nav: NavigateFunction
}

export async function executeNdprPackageSubmit(
  deps: SubmitPackageDeps,
): Promise<{ provisionWarning: string | null; permitId: string }> {
  const {
    packageDraft,
    createPermit,
    updatePermit,
    transition,
    resolveUser,
    userDirectory,
  } = deps

  const p = await ensurePermitForPackageSubmit({ packageDraft, createPermit, updatePermit })

  if (packageDraft.workPermissions) {
    await updatePermit(p.id, { workPermissions: packageDraft.workPermissions })
  }

  const { buildSigningPackagePdf } = await import('./buildSigningPackagePdf')
  const packagePdf = await buildSigningPackagePdf(p, resolveUser, userDirectory)
  await updatePermit(p.id, { packagePdf })
  await transition(p.id, 'on_approval')

  let provisionWarning: string | null = null
  try {
    const { provisionPermitSignersClient } = await import('./provisionSigners')
    const result = await provisionPermitSignersClient(p.id)
    if (!result) {
      provisionWarning =
        'Наряд отправлен, но уведомления подписантам не созданы (Firebase Functions недоступны).'
    }
  } catch (e) {
    provisionWarning =
      e instanceof Error
        ? `Наряд отправлен, но уведомления не созданы: ${e.message}`
        : 'Наряд отправлен, но уведомления подписантам не созданы.'
  }

  clearPackageSession()
  return { provisionWarning, permitId: p.id }
}

export function buildPackageDraft(args: {
  draft: PermitDraft
  form: AsorForm
  ppr: PprForm | undefined
}): PermitDraft {
  const { draft, form, ppr } = args
  const abrShift =
    draft.f02.shift ||
    (form.abr?.shiftNight ? 'night' : form.abr?.shiftDay ? 'day' : '')

  return {
    ...draft,
    title: draft.title.trim(),
    workDescription:
      draft.workStages.trim() ||
      draft.workDescription.trim() ||
      draft.workDescription,
    ppr,
    asor: form,
    f02: { ...draft.f02, shift: abrShift },
    f04: draft.permitType === 'cold' ? undefined : draft.f04,
    isContractorPermit: false,
    performerUid: draft.performerUid,
    registrationRefNo: draft.registrationRefNo.trim() || draft.registrationRefNo,
  }
}
