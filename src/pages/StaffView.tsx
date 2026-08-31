import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { StaffLayout, type StaffPage } from '../components/Staff/StaffLayout'
import { SortingView } from '../components/Staff/SortingView'
import { BuybackView } from '../components/Staff/BuybackView'
import type { BuybackItem, BuybackBatch } from '../types/inventory'

interface Props {
  storeCode: string
}

interface StoreInfo {
  store_id: string
  store_name: string
}

function formatDatetime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`
}

function loadBatches(storeId: string): BuybackBatch[] {
  try {
    const raw = localStorage.getItem(`buyback_${storeId}`)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveBatches(storeId: string, batches: BuybackBatch[]) {
  try { localStorage.setItem(`buyback_${storeId}`, JSON.stringify(batches)) } catch {}
}

export function StaffView({ storeCode }: Props) {
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState<StaffPage>('sorting')
  const [pendingBuyback, setPendingBuyback] = useState<BuybackItem[]>([])
  const [batches, setBatches] = useState<BuybackBatch[]>([])

  useEffect(() => {
    supabase
      .from('stores')
      .select('store_id, store_name')
      .eq('store_code', storeCode)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setError(`店舗「${storeCode}」が見つかりません`)
        else {
          setStore(data)
          setBatches(loadBatches(data.store_id))
        }
      })
  }, [storeCode])

  const handleAddBuyback = useCallback((item: BuybackItem) => {
    setPendingBuyback(prev => {
      if (prev.some(i => i.id === item.id)) return prev
      return [...prev, item]
    })
  }, [])

  const handleMoveBuyback = useCallback((ids: string[]) => {
    if (!store) return
    const toMove = pendingBuyback.filter(i => ids.includes(i.id))
    if (toMove.length === 0) return

    const now = new Date()
    const newBatch: BuybackBatch = {
      id: crypto.randomUUID(),
      label: formatDatetime(now),
      moved_at: now.toISOString(),
      items: toMove,
    }
    const newBatches = [...batches, newBatch]
    setBatches(newBatches)
    saveBatches(store.store_id, newBatches)
    setPendingBuyback(prev => prev.filter(i => !ids.includes(i.id)))
    setPage('buyback')
  }, [store, pendingBuyback, batches])

  const handleClearBuyback = useCallback((ids: string[]) => {
    setPendingBuyback(prev => prev.filter(i => !ids.includes(i.id)))
  }, [])

  const handleUpdateBatches = useCallback((newBatches: BuybackBatch[]) => {
    if (!store) return
    setBatches(newBatches)
    saveBatches(store.store_id, newBatches)
  }, [store])

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

  return (
    <StaffLayout
      storeName={store.store_name}
      storeCode={storeCode}
      currentPage={page}
      onNavigate={setPage}
      pendingCount={pendingBuyback.length}
    >
      {page === 'sorting' ? (
        <SortingView
          storeId={store.store_id}
          pendingBuyback={pendingBuyback}
          onAddBuyback={handleAddBuyback}
          onMoveBuyback={handleMoveBuyback}
          onClearBuyback={handleClearBuyback}
        />
      ) : (
        <BuybackView
          storeId={store.store_id}
          batches={batches}
          onUpdateBatches={handleUpdateBatches}
        />
      )}
    </StaffLayout>
  )
}
