import {
  activitiesRequireErtApproval,
  type Permit,
  type PermitDraft,
} from '../types/domain'

/** Огневые работы — ERT (ПАС) в очереди согласования и газотест. */
export function permitRequiresErtApproval(
  permit: Pick<
    Permit | PermitDraft,
    'specialWorkActivities' | 'specialWorkActivity' | 'permitType'
  >,
): boolean {
  if (permit.permitType === 'fire') return true
  return activitiesRequireErtApproval(
    permit.specialWorkActivities,
    permit.specialWorkActivity,
  )
}
