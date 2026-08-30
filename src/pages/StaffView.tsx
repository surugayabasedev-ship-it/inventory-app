import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { SortingView } from '../components/Staff/SortingView'

interface Props {
  storeCode: string
}

interface StoreInfo {
  store_id: string
  store_name: string
}

export function StaffView({ storeCode }: Props) {
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
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>URLのstoreパラメータを確認してください</div>
      </div>
    </div>
  )

  if (!store) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8', fontFamily: '"Noto Sans JP", sans-serif' }}>
      読み込み中...
    </div>
  )

  return <SortingView storeId={store.store_id} storeName={store.store_name} />
}
