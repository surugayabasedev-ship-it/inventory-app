import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ContentsAdmin } from '../components/Admin/ContentsAdmin'

type AdminPage = 'contents' | 'shelves'

interface StoreInfo {
  store_id: string
  store_name: string
}

interface Props {
  storeCode: string
  page: AdminPage
}

export function AdminView({ storeCode, page }: Props) {
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('store_code', storeCode)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setError(`店舗「${storeCode}」が見つかりません`)
        else setStore(data)
      })
  }, [storeCode])

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: '"Noto Sans JP", sans-serif' }}>
      <div style={{ textAlign: 'center', color: '#dc2626' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{error}</div>
      </div>
    </div>
  )

  if (!store) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8', fontFamily: '"Noto Sans JP", sans-serif' }}>
      読み込み中...
    </div>
  )

  if (page === 'contents') {
    return <ContentsAdmin storeId={store.store_id} storeName={store.store_name} storeCode={storeCode} />
  }

  // page === 'shelves' は今後実装
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: '"Noto Sans JP", sans-serif', color: '#64748b' }}>
      棚割管理は準備中です
    </div>
  )
}
