import { useState } from 'react'

export type StaffPage = 'sorting' | 'buyback'

interface Props {
  storeName: string
  storeCode?: string
  currentPage: StaffPage
  onNavigate: (page: StaffPage) => void
  pendingCount?: number
  children: React.ReactNode
}

const NAV: { key: StaffPage; label: string; icon: string }[] = [
  { key: 'sorting', label: '商品仕分け', icon: '📦' },
  { key: 'buyback', label: '買戻し確認', icon: '🔄' },
]

export function StaffLayout({ storeName, storeCode, currentPage, onNavigate, pendingCount = 0, children }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const W = collapsed ? 56 : 200

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '"Noto Sans JP", sans-serif', overflow: 'hidden' }}>

      {/* サイドバー */}
      <div style={{
        width: W, minWidth: W, background: '#1a2332', color: '#fff',
        display: 'flex', flexDirection: 'column', transition: 'width 0.2s',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {/* 店舗名 */}
        <div style={{ padding: collapsed ? '20px 12px' : '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {!collapsed ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {storeName}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>在庫仕分けシステム</div>
            </>
          ) : (
            <div style={{ fontSize: 20, textAlign: 'center' }}>≡</div>
          )}
        </div>

        {/* ナビ */}
        <div style={{ flex: 1, paddingTop: 8 }}>
          {NAV.map(item => {
            const active = item.key === currentPage
            const badge = item.key === 'sorting' && pendingCount > 0 ? pendingCount : null
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                title={collapsed ? item.label : undefined}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  padding: collapsed ? '12px 0' : '10px 16px',
                  background: active ? '#2563eb' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                  fontSize: 14, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center',
                  gap: 10, whiteSpace: 'nowrap',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {!collapsed && (
                  <span style={{ flex: 1 }}>{item.label}</span>
                )}
                {!collapsed && badge && (
                  <span style={{
                    background: '#f97316', color: '#fff', borderRadius: 10,
                    fontSize: 11, fontWeight: 700, padding: '1px 6px', minWidth: 18, textAlign: 'center',
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 折りたたみ */}
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{
            width: '100%', padding: '12px 0', border: 'none',
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
          }}
        >
          {collapsed ? '▶' : '◀'}
        </button>

        {/* 管理画面へ */}
        {storeCode && (
          <button
            onClick={() => { window.location.search = `?mode=admin&store=${storeCode}&page=shelves` }}
            style={{
              width: '100%', padding: '14px 0', border: 'none',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {collapsed ? '⚙' : '管理画面へ'}
          </button>
        )}
      </div>

      {/* コンテンツエリア */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8f9fa', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}
