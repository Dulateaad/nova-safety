import type { DocumentData } from 'firebase-admin/firestore'

const ERT_APPROVAL_ACTIVITIES = new Set(['open_flame_fire'])

/** Огневые работы — ERT (ПАС) в очереди согласования и газотест. */
export function permitRequiresErtApproval(permit: DocumentData): boolean {
  if (String(permit.permitType ?? '') === 'fire') return true
  const single = String(permit.specialWorkActivity ?? '')
  if (ERT_APPROVAL_ACTIVITIES.has(single)) return true
  const activities = Array.isArray(permit.specialWorkActivities)
    ? permit.specialWorkActivities
    : []
  return activities.some((a) => ERT_APPROVAL_ACTIVITIES.has(String(a)))
}
