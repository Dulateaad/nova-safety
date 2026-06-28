import type { DemoUser, Permit, PermitStatus } from '../types/domain'

import { fillTemplate, localeMessages, statusLabel } from '../i18n/getLocale'

import { requiresWorkPermissions } from './workPermissions'

import type { WorkPermissionCheckboxItem } from '../types/workPermissions'



const PRE_WORK_EDIT_STATUSES = new Set<PermitStatus>([

  'on_approval',

  'issued',

  'in_progress',

  'suspended',

])



export function preWorkChecksStarted(items: WorkPermissionCheckboxItem[]): boolean {

  return items.some((item) => item.checked || item.note.trim().length > 0)

}



/** Раздел 3 разрешений заполняет производитель работ. */

export function canPerformerEditPreWorkChecks(permit: Permit, actor: DemoUser): boolean {

  if (actor.role !== 'performer') return false

  const assigned = permit.performerUid?.trim()

  if (assigned && assigned !== actor.id) return false

  return PRE_WORK_EDIT_STATUSES.has(permit.status)

}



/** @deprecated Используйте canPerformerEditPreWorkChecks */

export const canPermitterEditPreWorkChecks = canPerformerEditPreWorkChecks



export function performerPreWorkBlockedHint(status: PermitStatus): string {

  const p = localeMessages().preWorkCheck

  if (status === 'on_approval') return p.onApprovalHint

  if (status === 'draft') return p.draftHint

  if (status === 'closed' || status === 'archived' || status === 'annulled') {

    return fillTemplate(p.closedHint, { status: statusLabel(status) })

  }

  if (status === 'rejected') return p.rejectedHint

  return fillTemplate(p.editHint, { status: statusLabel(status) })

}



export function performerPreWorkDocsNeedingFill(permit: Permit): number {

  const docs = permit.workPermissions?.documents ?? []

  return docs.filter((doc) => {

    if (doc.kind === 'confined_space') return false

    return !preWorkChecksStarted(doc.form.preWorkChecks.items)

  }).length

}



export function performerPreWorkTaskSummary(permit: Permit): string | null {

  const p = localeMessages().preWorkCheck

  if (!requiresWorkPermissions(permit)) return null

  if (!permit.workPermissions?.documents?.length) return p.noPermissions

  const editable = permit.workPermissions.documents.filter((d) => d.kind !== 'confined_space')

  if (editable.length === 0) return null

  if (!PRE_WORK_EDIT_STATUSES.has(permit.status)) {

    return performerPreWorkBlockedHint(permit.status)

  }

  const empty = performerPreWorkDocsNeedingFill(permit)

  if (empty > 0) {

    return fillTemplate(p.fillChecks, { empty })

  }

  return p.checksFilled

}



export type PerformerPreWorkTask = {

  permit: Permit

  summary: string

  needsFill: boolean

}



/** @deprecated Используйте PerformerPreWorkTask */

export type PermitterPreWorkTask = PerformerPreWorkTask



/** Задания производителя: заполнить раздел 3 разрешений. */

export function performerPreWorkTasksForUser(

  permits: Permit[],

  user: DemoUser | null | undefined,

): PerformerPreWorkTask[] {

  if (!user || user.role !== 'performer') return []

  const items: PerformerPreWorkTask[] = []

  for (const permit of permits) {

    if (!canPerformerEditPreWorkChecks(permit, user)) continue

    const empty = performerPreWorkDocsNeedingFill(permit)

    if (empty === 0) continue

    const summary = performerPreWorkTaskSummary(permit)

    if (!summary) continue

    items.push({ permit, summary, needsFill: true })

  }

  return items.sort((a, b) =>

    (b.permit.updatedAtIso ?? '').localeCompare(a.permit.updatedAtIso ?? ''),

  )

}



/** @deprecated Используйте performerPreWorkTasksForUser */

export const permitterPreWorkTasksForUser = performerPreWorkTasksForUser

