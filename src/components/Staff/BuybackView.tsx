import { useState, useCallback } from 'react'
import type { BuybackBatch, BuybackItem } from '../../types/inventory'

interface Props {
  storeId: string
  batches: BuybackBatch[]
  onUpdateBatches: (batches: BuybackBatch[]) => void
}

function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const bom = '﻿'
  const csv = bom + rows
    .map(r => r.map(cell => {
      const s = String(cell ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportBatch(batch: BuybackBatch, items: BuybackItem[]) {
  const dt = batch.label

  // 買戻し申し込み用: A=商品コード, B=1, C=0
  downloadCSV(`買戻し申し込み用_${dt}.csv`, items.map(it => [
    it.product_no3 ?? it.product_no,
    1,
    0,
  ]))

  // 少し間を置いて2枚目（ブラウザのダウンロード制限回避）
  setTimeout(() => {
    // 出庫登録用: A=1, B=商品コード, C=税抜単価, D=税込単価, E=1, F=枝番
    downloadCSV(`出庫登録用_${dt}.csv`, items.map(it => {
      const priceExcl = it.used_price ?? 0
      const priceIncl = Math.round(priceExcl * 1.1)
      return [1, it.product_no3 ?? it.product_no, priceExcl, priceIncl, 1, it.branch_no ?? '']
    }))
  }, 300)
}

function formatLabel(label: string): string {
  // "202609010930" → "2026/09/01 09:30"
  if (label.length === 12) {
    return `${label.slice(0,4)}/${label.slice(4,6)}/${label.slice(6,8)} ${label.slice(8,10)}:${label.slice(10,12)}`
  }
  return label
}

export function BuybackView({ storeId: _storeId, batches, onUpdateBatches }: Props) {
  const [checkedMap, setCheckedMap] = useState<Record<string, Set<string>>>({})

  const toggleItem = (batchId: string, itemId: string) => {
    setCheckedMap(prev => {
      const set = new Set(prev[batchId] ?? [])
      set.has(itemId) ? set.delete(itemId) : set.add(itemId)
      return { ...prev, [batchId]: set }
    })
  }

  const toggleAll = (batch: BuybackBatch) => {
    const checked = checkedMap[batch.id] ?? new Set()
    setCheckedMap(prev => ({
      ...prev,
      [batch.id]: checked.size === batch.items.length
        ? new Set()
        : new Set(batch.items.map(i => i.id)),
    }))
  }

  const deleteSelected = useCallback((batch: BuybackBatch) => {
    const checked = checkedMap[batch.id]
    if (!checked || checked.size === 0) return
    const newItems = batch.items.filter(i => !checked.has(i.id))
    const newBatches = newItems.length === 0
      ? batches.filter(b => b.id !== batch.id)
      : batches.map(b => b.id === batch.id ? { ...b, items: newItems } : b)
    onUpdateBatches(newBatches)
    setCheckedMap(prev => ({ ...prev, [batch.id]: new Set() }))
  }, [batches, checkedMap, onUpdateBatches])

  const deleteAll = useCallback((batchId: string) => {
    onUpdateBatches(batches.filter(b => b.id !== batchId))
    setCheckedMap(prev => { const n = { ...prev }; delete n[batchId]; return n })
  }, [batches, onUpdateBatches])

  const exportSelected = useCallback((batch: BuybackBatch) => {
    const checked = checkedMap[batch.id]
    const items = checked && checked.size > 0
      ? batch.items.filter(i => checked.has(i.id))
      : batch.items
    exportBatch(batch, items)
  }, [checkedMap])

  if (batches.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 16 }}>
        移動済みのアイテムはありません
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
      {[...batches].reverse().map(batch => {
        const checked = checkedMap[batch.id] ?? new Set()
        const allChecked = checked.size === batch.items.length
        const someChecked = checked.size > 0

        return (
          <div key={batch.id} style={{
            background: '#fff', border: '2px solid #e2e8f0', borderRadius: 12,
            marginBottom: 20, overflow: 'hidden',
          }}>
            {/* バッチヘッダー */}
            <div style={{
              padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <input
                type="checkbox"
                checked={allChecked && batch.items.length > 0}
                ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                onChange={() => toggleAll(batch)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                  {formatLabel(batch.label)} に移動
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {batch.items.length}件
                  {someChecked && ` / ${checked.size}件選択中`}
                </div>
              </div>
            </div>

            {/* アイテム一覧 */}
            <div>
              {batch.items.map(it => (
                <div key={it.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px', borderBottom: '1px solid #f1f5f9',
                }}>
                  <input
                    type="checkbox"
                    checked={checked.has(it.id)}
                    onChange={() => toggleItem(batch.id, it.id)}
                    style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.content_name ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                      {it.product_no3}
                      {it.branch_no != null ? ` 枝番:${it.branch_no}` : ''}
                      {it.title ? ` / ${it.title}` : ''}
                    </div>
                  </div>
                  {it.used_price != null && (
                    <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      ¥{it.used_price.toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ボタン */}
            <div style={{ padding: '12px 16px', display: 'flex', gap: 8, borderTop: '1px solid #e2e8f0' }}>
              <button
                onClick={() => deleteSelected(batch)}
                disabled={!someChecked}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: someChecked ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                  background: someChecked ? '#fee2e2' : '#f1f5f9',
                  color: someChecked ? '#b91c1c' : '#94a3b8',
                  border: `1px solid ${someChecked ? '#fca5a5' : '#e2e8f0'}`,
                }}
              >
                一部削除（{checked.size}件）
              </button>
              <button
                onClick={() => deleteAll(batch.id)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5',
                }}
              >
                全削除
              </button>
              <button
                onClick={() => exportSelected(batch)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: '#1a2332', color: '#fff', border: 'none',
                }}
              >
                CSV出力{someChecked ? `（${checked.size}件）` : `（全${batch.items.length}件）`}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
