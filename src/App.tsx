import { StaffView } from './pages/StaffView'
import { AdminView } from './pages/AdminView'

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode')
  const store = params.get('store') ?? 'machida-modi'
  const page = params.get('page') ?? 'contents'

  if (mode === 'staff') {
    return <StaffView storeCode={store} />
  }

  if (mode === 'admin') {
    return <AdminView storeCode={store} page={page as 'contents' | 'shelves'} />
  }

  // 顧客画面（今後実装）
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontFamily: '"Noto Sans JP", sans-serif',
      background: '#f8f9fa', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ fontSize: 32, fontWeight: 900, color: '#1a2c6e' }}>駿河屋 売場ナビ</div>
      <div style={{ color: '#64748b' }}>顧客向け画面は準備中です</div>
      <a
        href="?mode=staff&store=machida-modi"
        style={{ marginTop: 8, color: '#1a2c6e', fontSize: 14, textDecoration: 'underline' }}
      >
        スタッフ画面へ（町田モディ店）
      </a>
    </div>
  )
}
