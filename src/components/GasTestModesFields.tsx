import type { WorkPermissionForm } from '../types/workPermissions'

export function GasTestModesFields(props: {
  form: WorkPermissionForm
  disabled?: boolean
  onChange: (patch: Partial<WorkPermissionForm>) => void
}) {
  const { form, disabled, onChange } = props
  const primary = form.gasTestPrimary ?? true
  const interval = form.gasTestPrimaryInterval ?? 'каждые 2 часа'
  const continuous = form.gasTestContinuous ?? false
  return (
    <fieldset className="work-perm-gas-modes" disabled={disabled}>
      <legend className="work-perm-checks__legend">Виды газотеста</legend>
      <label className="check work-perm-gas-modes__row">
        <input
          type="checkbox"
          checked={primary}
          onChange={(e) => onChange({ gasTestPrimary: e.target.checked })}
        />
        <span>Первичный</span>
      </label>
      {primary ? (
        <label className="work-perm-field work-perm-field--wide">
          <span className="work-perm-field__label">Периодичность первичного газотеста</span>
          <input
            value={interval}
            placeholder="каждые 2 часа"
            onChange={(e) => onChange({ gasTestPrimaryInterval: e.target.value })}
          />
        </label>
      ) : null}
      <label className="check work-perm-gas-modes__row">
        <input
          type="checkbox"
          checked={continuous}
          onChange={(e) => onChange({ gasTestContinuous: e.target.checked })}
        />
        <span>Постоянный</span>
      </label>
    </fieldset>
  )
}
