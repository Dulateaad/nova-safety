import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import type { DemoUser, UserRole } from '../types/domain'
import { db, firebaseConfigured } from '../lib/firebase'
import { profileDocToDemoUser } from '../lib/userProfile'
import { useSession } from '../context/SessionContext'
import { useLanguage } from '../context/LanguageContext'
import { roleLabel } from '../i18n/getLocale'

const ROLE_ORDER: UserRole[] = [
  'coordinator',
  'issuer',
  'permitter',
  'performer',
  'leadExpert',
  'ert',
  'safety',
  'contractor',
  'executor',
]

function roleRank(role: UserRole): number {
  const idx = ROLE_ORDER.indexOf(role)
  return idx === -1 ? ROLE_ORDER.length : idx
}

function splitDisplayName(displayName: string): { name: string; position: string } {
  const dash = displayName.indexOf(' — ')
  if (dash === -1) return { name: displayName.trim(), position: '—' }
  return {
    name: displayName.slice(0, dash).trim() || displayName,
    position: displayName.slice(dash + 3).trim() || '—',
  }
}

export function AdminPersonnelTable() {
  const { t, language } = useLanguage()
  const { userDirectory } = useSession()
  const ap = t.adminPage
  const [rows, setRows] = useState<DemoUser[]>([])
  const [loading, setLoading] = useState(true)

  const loadRows = useCallback(async () => {
    if (!firebaseConfigured || !db) {
      const demo = [...userDirectory].sort((a, b) => {
        const byRole = roleRank(a.role) - roleRank(b.role)
        if (byRole !== 0) return byRole
        return a.displayName.localeCompare(b.displayName, 'ru')
      })
      setRows(demo)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'users'))
      const next: DemoUser[] = []
      snap.forEach((d) => {
        next.push(
          profileDocToDemoUser(
            d.id,
            d.data() as Record<string, unknown>,
            String((d.data() as { email?: string }).email ?? ''),
          ),
        )
      })
      next.sort((a, b) => {
        const byRole = roleRank(a.role) - roleRank(b.role)
        if (byRole !== 0) return byRole
        return a.displayName.localeCompare(b.displayName, 'ru')
      })
      setRows(next)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [userDirectory])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const sorted = useMemo(() => rows, [rows])

  return (
    <section className="card admin-panel__section">
      <h2 className="admin-panel__heading">{ap.personnelTitle}</h2>
      <p className="muted small">{ap.personnelHint}</p>
      {loading ? (
        <p className="muted small">{t.common.loading ?? '…'}</p>
      ) : sorted.length === 0 ? (
        <p className="muted small">{ap.personnelEmpty}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table admin-panel__people">
            <thead>
              <tr>
                <th>{ap.colName}</th>
                <th>{ap.colPosition}</th>
                <th>{ap.colRole}</th>
                <th>{ap.colDepartment}</th>
                <th>{ap.colAction}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const { name, position } = splitDisplayName(row.displayName)
                return (
                  <tr key={row.id}>
                    <td>{name}</td>
                    <td className="muted small">{position}</td>
                    <td className="small">{roleLabel(row.role, language)}</td>
                    <td className="muted small">{ap.defaultDepartment}</td>
                    <td>
                      <Link className="small" to="/admin#emails">
                        {ap.edit}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
