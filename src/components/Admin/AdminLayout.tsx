import { useState } from 'react'

interface NavItem {
  label: string
  page: string
}

interface NavSection {
  title?: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    title: 'マスタ管理',
    items: [
      { label: 'コンテンツ管理', page: 'contents' },
      { label: '棚割管理',       page: 'shelves' },
    ],
  },
]

interface Props {
  storeName: string
  storeCode: string
  currentPage: string
  children: React.ReactNode
}

export function AdminLayout({ storeName, storeCode, currentPage, children }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const navigate = (page: string) => {
    window.location.search = `?mode=admin&store=${storeCode}&page=${page}`
  }

  const W = collapsed ? 56 : 200

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '"Noto Sans JP", sans-serif', overflow: 'hidden' }}>

      {/* サイドバー */}
      <div style={{
        width: W, minWidth: W, background: '#1a2332', color: '#fff',
        display: 'flex', flexDirection: 'column', transition: 'width 0.2s', overflow: 'hidden',
        position: 'relative', flexShrink: 0,
      }}>

        {/* 店舗名ヘッダー */}
        <div style={{ padding: collapsed ? '20px 12px' : '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {!collapsed && (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {storeName}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>管理画面</div>
            </>
          )}
          {collapsed && <div style={{ fontSize: 20, textAlign: 'center' }}>≡</div>}
        </div>

        {/* ナビ */}
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
          {NAV.map((sec, si) => (
            <div key={si}>
              {sec.title && !collapsed && (
                <div style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600,
                  padding: '12px 16px 4px', letterSpacing: '0.05em',
                }}>
                  {sec.title}
                </div>
              )}
              {sec.items.map(item => {
                const active = item.page === currentPage
                return (
                  <button
                    key={item.page}
                    onClick={() => navigate(item.page)}
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
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    {!collapsed && item.label}
                    {collapsed && item.label[0]}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* 折りたたみボタン */}
        <button
          onClick={() => setCollapsed(v => !v)}
          style={{
            width: '100%', padding: '12px 0', border: 'none', background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
          }}
        >
          {collapsed ? '▶' : '◀'}
        </button>

        {/* スタッフ画面へ */}
        <button
          onClick={() => { window.location.search = `?mode=staff&store=${storeCode}` }}
          style={{
            width: '100%', padding: '14px 0', border: 'none',
            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {collapsed ? '↩' : 'スタッフ画面へ'}
        </button>
      </div>

      {/* コンテンツエリア */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f8f9fa' }}>
        {children}
      </div>
    </div>
  )
}
