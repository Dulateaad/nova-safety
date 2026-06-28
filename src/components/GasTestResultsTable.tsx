import type { GasTestReading } from '../types/workPermissions'
import { WORK_PERMISSION_KIND_LABELS, type WorkPermissionKind } from '../types/workPermissions'
import { useLanguage } from '../context/LanguageContext'

function datetimeLocalValue(atIso: string): string {
  if (!atIso) return ''
  const d = new Date(atIso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function GasTestResultsTable(props: {
  kind: WorkPermissionKind
  readings: GasTestReading[]
  editable?: boolean
  ertOnly?: boolean
  isErt?: boolean
  tableTitle?: string
  onChange?: (id: string, patch: Partial<GasTestReading>) => void
  onAddRow?: () => void
}) {
  const {
    kind,
    readings,
    editable = false,
    ertOnly = false,
    isErt = false,
    tableTitle,
    onChange,
    onAddRow,
  } = props
  const { t } = useLanguage()
  const gt = t.gasTest

  const canEdit = editable && (!ertOnly || isErt)
  const isEmpty = readings.length === 0
  const title = tableTitle ?? (ertOnly ? gt.openSection : gt.panelTitle)

  return (
    <div className="gas-test-table-wrap">
      <div className="gas-test-table__head">
        <h4 className="gas-test-table__title">{title}</h4>
        <p className="muted xsmall">
          {WORK_PERMISSION_KIND_LABELS[kind]}
          {ertOnly ? gt.ertFillsNote : ''}
        </p>
      </div>
      {isEmpty && canEdit ? (
        <div className="gas-test-table__empty-cta">
          <p className="small" style={{ margin: 0 }}>
            {gt.emptyTable}
          </p>
          {onAddRow ? (
            <button type="button" className="btn primary small" onClick={onAddRow}>
              {gt.addRow}
            </button>
          ) : null}
        </div>
      ) : null}
      {!isEmpty ? (
        <>
          <div className="gas-test-table-scroll">
            <table className="gas-test-table">
              <thead>
                <tr>
                  <th>{gt.colDateIssued}</th>
                  <th>{gt.colWorkZone}</th>
                  <th>LEL %</th>
                  <th>H2S ppm</th>
                  <th>O2 %</th>
                  <th>CO ppm</th>
                  <th>{gt.colInstrument}</th>
                  <th>{gt.colWorker}</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {canEdit ? (
                        <input
                          type="datetime-local"
                          className="gas-test-table__input"
                          value={datetimeLocalValue(r.atIso)}
                          onChange={(e) => {
                            const v = e.target.value
                            onChange?.(r.id, {
                              atIso: v ? new Date(v).toISOString() : '',
                            })
                          }}
                        />
                      ) : (
                        r.atIso ? new Date(r.atIso).toLocaleString('ru-RU') : '—'
                      )}
                    </td>
                    <td>
                      {canEdit ? (
                        <input
                          className="gas-test-table__input"
                          value={r.location}
                          placeholder={gt.colWorkZone}
                          onChange={(e) => onChange?.(r.id, { location: e.target.value })}
                        />
                      ) : (
                        r.location || '—'
                      )}
                    </td>
                    {(['lelPercent', 'h2sPpm', 'o2Percent', 'coPpm'] as const).map((field) => (
                      <td key={field}>
                        {canEdit ? (
                          <input
                            className="gas-test-table__input gas-test-table__input--num"
                            value={r[field]}
                            inputMode="decimal"
                            placeholder="0"
                            onChange={(e) => onChange?.(r.id, { [field]: e.target.value })}
                          />
                        ) : (
                          r[field] || '—'
                        )}
                      </td>
                    ))}
                    <td>
                      {canEdit ? (
                        <input
                          className="gas-test-table__input"
                          value={r.instrumentNo}
                          placeholder={gt.colInstrument}
                          onChange={(e) =>
                            onChange?.(r.id, { instrumentNo: e.target.value })
                          }
                        />
                      ) : (
                        r.instrumentNo || '—'
                      )}
                    </td>
                    <td className="gas-test-table__tester">{r.testerName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && onAddRow ? (
            <button type="button" className="btn ghost small" onClick={onAddRow}>
              {gt.addRow}
            </button>
          ) : null}
        </>
      ) : null}
      {ertOnly && !isErt && editable ? (
        <p className="muted xsmall gas-test-table__hint">
          Редактирование таблицы доступно только пользователю с ролью ПАС (ERT).
        </p>
      ) : null}
    </div>
  )
}
