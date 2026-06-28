import { addAbrStage } from './abrStageListEdit'
import { addNeboshTask } from './neboshTaskListEdit'
import { mergeNeboshApprovalPeopleFromNd } from './ndprApprovalPeople'
import {
  applyAbrHeaderFromPprNd,
  mergeAbrPeopleFromNd,
} from './prefillAbrFromPackage'
import { prefillAsorTeamFromNd } from './pprAsorPrefill'
import type { PermitDraft } from '../types/domain'
import type { PprForm } from '../types/ppr'
import type { AsorForm } from '../types/asor'
import { ASOR_EDITOR_AUTOSAVE_KEY, emptyAsorForm, normalizeAsorIncoming } from '../types/asor'
import { emptyAbrForm } from '../types/abr'

/** Восстанавливает черновик из sessionStorage. */
export function loadRiskAssessmentForm(): AsorForm | null {
  try {
    const raw = sessionStorage.getItem(ASOR_EDITOR_AUTOSAVE_KEY)
    if (!raw) return null
    const parsed = normalizeAsorIncoming(JSON.parse(raw))
    return parsed ?? null
  } catch {
    return null
  }
}

/** Минимальная структура для ручного заполнения (этап АБР, задание оценки риска). */
export function ensureManualRiskScaffold(
  form: AsorForm,
  nd: PermitDraft,
  ppr: PprForm,
  resolveName: (uid: string) => string,
  resolveBadge: (uid: string) => string,
): AsorForm {
  let next = form
  if (!next.abr?.stages.length) {
    const abrBase =
      next.abr ??
      mergeAbrPeopleFromNd(
        applyAbrHeaderFromPprNd(emptyAbrForm(), ppr, nd),
        nd,
        resolveName,
        resolveBadge,
      )
    next = { ...next, abr: addAbrStage(abrBase) }
  }
  if (!next.tasks.length) {
    next = addNeboshTask(next)
  }
  return next
}

/** Стартовая форма для ручного заполнения АБР и оценки риска. */
export function buildManualRiskAssessmentForm(
  nd: PermitDraft,
  ppr: PprForm,
  resolveName: (uid: string) => string,
  resolveBadge: (uid: string) => string,
): AsorForm {
  let abr = mergeAbrPeopleFromNd(
    applyAbrHeaderFromPprNd(emptyAbrForm(), ppr, nd),
    nd,
    resolveName,
    resolveBadge,
  )
  abr = addAbrStage(abr)

  let form = prefillAsorTeamFromNd(nd, emptyAsorForm(), resolveName)
  form = mergeNeboshApprovalPeopleFromNd(form, nd, resolveName, resolveBadge)

  const workPlaces = [ppr.siteName, ppr.workArea].filter((s) => s.trim()).join(', ')

  return {
    ...form,
    abr,
    shortTitleForNarjad:
      nd.title.trim() || form.shortTitleForNarjad || ppr.workTitle.trim(),
    workPlacesText: workPlaces || form.workPlacesText,
    nebosh: {
      ...form.nebosh,
      siteObject: ppr.siteName.trim() || form.nebosh.siteObject,
      contractorOrg:
        nd.f02?.company?.trim() || ppr.contractorOrg.trim() || form.nebosh.contractorOrg,
      preparedBy: nd.performerUid.trim()
        ? resolveName(nd.performerUid)
        : form.nebosh.preparedBy,
      assessmentDateIso:
        nd.f02?.startDate?.slice(0, 10) || form.nebosh.assessmentDateIso,
    },
  }
}
