import { useEffect, useRef, useState, useCallback } from 'react'
import { useInventorySearch, type SearchMode } from '../../hooks/useInventorySearch'
import { isTriggerBarcode } from '../../lib/barcode'
import { getContentName, getShelfRouteLabel, getSearchDisplayName, getContentTypeName } from '../../lib/inventoryRouting'
import type { BuybackItem, InventoryItem } from '../../types/inventory'

interface Props {
  storeId: string
  pendingBuyback: BuybackItem[]
  onAddBuyback: (item: BuybackItem) => void
  onMoveBuyback: (ids: string[]) => void
  onClearBuyback: (ids: string[]) => void
}

interface HistoryEntry {
  query: string
  label: string
  shelfNo: number | null
  status: 'found' | 'not_found' | 'out_of_scope' | 'no_shelf'
}

const MODES: { key: SearchMode; label: string }[] = [
  { key: 'barcode',      label: 'バーコード' },
  { key: 'product_no',   label: '商品番号'   },
  { key: 'content_name', label: 'コンテンツ名' },
]

function makeBuybackItem(it: InventoryItem): BuybackItem {
  return {
    id: it.product_no3 ?? it.product_no ?? crypto.randomUUID(),
    product_no3: it.product_no3,
    product_no: it.product_no,
    title: it.title,
    content_name: it.content_name ?? it.genre_name,
    used_price: it.used_price,
    branch_no: it.branch_no,
  }
}

export function SortingView({ storeId, pendingBuyback, onAddBuyback, onMoveBuyback, onClearBuyback }: Props) {
  const [mode, setMode] = useState<SearchMode>('barcode')
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const { result, loading, search, clear } = useInventorySearch(storeId)

  useEffect(() => {
    if (mode === 'barcode') inputRef.current?.focus()
  }, [mode, result])

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return
    await search(q, mode)
  }, [search, mode])

  const handleInput = useCallback((val: string) => {
    setInput(val)
    if (mode === 'barcode' && isTriggerBarcode(val)) {
      handleSearch(val)
      setTimeout(() => setInput(''), 200)
    }
  }, [mode, handleSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      handleSearch(input)
      if (mode !== 'content_name') setInput('')
    }
  }, [input, handleSearch, mode])

  useEffect(() => {
    if (!result) return
    const item = result.items[0]
    const entry: HistoryEntry = {
      query: result.query,
      label: item ? getContentName(item) : result.query,
      shelfNo: item?.shelves[0]?.shelf_no ?? null,
      status: result.status,
    }
    setHistory(prev => [entry, ...prev].slice(0, 12))
    if (mode !== 'content_name') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [result]) // eslint-disable-line react-hooks/exhaustive-deps

  const changeMode = (m: SearchMode) => {
    setMode(m)
    setInput('')
    clear()
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const addToBuyback = (it: InventoryItem) => {
    onAddBuyback(makeBuybackItem(it))
  }

  const handleMove = () => {
    const ids = checkedIds.size > 0 ? [...checkedIds] : pendingBuyback.map(i => i.id)
    onMoveBuyback(ids)
    setCheckedIds(new Set())
  }

  const handleClear = () => {
    const ids = checkedIds.size > 0 ? [...checkedIds] : pendingBuyback.map(i => i.id)
    onClearBuyback(ids)
    setCheckedIds(new Set())
  }

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (checkedIds.size === pendingBuyback.length) setCheckedIds(new Set())
    else setCheckedIds(new Set(pendingBuyback.map(i => i.id)))
  }

  const statusStyle = (() => {
    if (!result) return null
    switch (result.status) {
      case 'found':     return { bg: '#dcfce7', border: '#16a34a', text: '#15803d' }
      case 'no_shelf':  return { bg: '#fff7ed', border: '#ea580c', text: '#c2410c' }
      case 'not_found': return { bg: '#fee2e2', border: '#dc2626', text: '#b91c1c' }
      default:          return { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' }
    }
  })()

  const item = result?.items[0]
  const shelf = item?.shelves[0]

  const pendingIds = new Set(pendingBuyback.map(i => i.id))
  const actionCount = checkedIds.size > 0 ? checkedIds.size : pendingBuyback.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* モードタブ + 入力エリア */}
      <div style={{ background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0 }}>
        {/* モードタブ */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
          {MODES.map(m => (
            <button
              key={m.key}
              onClick={() => changeMode(m.key)}
              style={{
                flex: 1, padding: '10px 8px', border: 'none',
                borderBottom: mode === m.key ? '3px solid #1a2332' : '3px solid transparent',
                background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                color: mode === m.key ? '#1a2332' : '#64748b',
                fontWeight: mode === m.key ? 700 : 400,
                fontSize: 14,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* 入力 */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: 10 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'barcode'      ? 'バーコードをスキャン...' :
              mode === 'product_no'   ? '商品番号を入力（9桁数値 or 英数字）' :
                                       'コンテンツ名を入力（例：ワンピース）'
            }
            style={{
              flex: 1, padding: '12px 16px', fontSize: 17,
              border: '2px solid #c8a84b', borderRadius: 8,
              outline: 'none', fontFamily: 'inherit', background: '#fff',
            }}
            autoComplete="off" autoCorrect="off" spellCheck={false}
          />
          {mode !== 'barcode' && (
            <button
              onClick={() => { handleSearch(input); if (mode !== 'content_name') setInput('') }}
              style={{
                padding: '12px 20px', background: '#1a2332', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              検索
            </button>
          )}
        </div>
        {mode === 'barcode' && (
          <p style={{ margin: '-4px 16px 10px', fontSize: 12, color: '#94a3b8' }}>
            スキャンすると自動的に検索します
          </p>
        )}
      </div>

      {/* 結果 + リスト */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>

        {loading && (
          <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 17 }}>検索中...</div>
        )}

        {/* バーコード・商品番号モード結果 */}
        {!loading && result && mode !== 'content_name' && statusStyle && (
          <div style={{
            background: statusStyle.bg, border: `3px solid ${statusStyle.border}`,
            borderRadius: 14, padding: '24px 28px', marginBottom: 16, textAlign: 'center',
          }}>
            {result.status === 'found' && shelf ? (
              <>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>棚番号</div>
                <div style={{ fontSize: 88, fontWeight: 900, color: statusStyle.text, lineHeight: 1.1 }}>
                  {shelf.shelf_no}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginTop: 10 }}>
                  {item ? getContentName(item) : '—'}
                </div>
                <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
                  {item?.category_name} / {item?.title}
                </div>
              </>
            ) : result.status === 'no_shelf' && item ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 6 }}>⚠️</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: statusStyle.text }}>棚未設定</div>
                <div style={{ fontSize: 17, color: '#1e293b', marginTop: 8 }}>{getContentName(item)}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>→ {getShelfRouteLabel(item)}</div>
                {!pendingIds.has(item.product_no3 ?? item.product_no ?? '') && (
                  <button
                    onClick={() => addToBuyback(item)}
                    style={{
                      marginTop: 14, padding: '8px 20px', background: '#f97316', color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    取扱外リストへ追加
                  </button>
                )}
                {pendingIds.has(item.product_no3 ?? item.product_no ?? '') && (
                  <div style={{ marginTop: 12, fontSize: 13, color: '#f97316', fontWeight: 600 }}>✔ リストに追加済み</div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 40, marginBottom: 6 }}>✕</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: statusStyle.text }}>在庫なし</div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
                  「{result.query}」はデータに存在しません
                </div>
              </>
            )}
          </div>
        )}

        {/* コンテンツ名検索結果 */}
        {!loading && result && mode === 'content_name' && (
          <div style={{ marginBottom: 16 }}>
            {result.status === 'not_found' ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#dc2626', fontSize: 18, fontWeight: 700 }}>
                「{result.query}」に該当するコンテンツが見つかりません
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>
                  {result.items.length}件のジャンルが見つかりました
                </div>
                {result.items.map((it, i) => (
                  <div key={i} style={{
                    background: '#fff', border: '2px solid #e2e8f0', borderRadius: 10,
                    padding: '12px 16px', marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    <div style={{
                      minWidth: 56, height: 56, borderRadius: 8,
                      background: it.shelves.length > 0 ? '#dcfce7' : '#fff7ed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24, fontWeight: 900,
                      color: it.shelves.length > 0 ? '#15803d' : '#c2410c',
                    }}>
                      {it.shelves[0]?.shelf_no ?? '—'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{getSearchDisplayName(it)}</div>
                      <div style={{ fontSize: 13, color: '#475569', marginTop: 1, fontWeight: 600 }}>{getContentTypeName(it)}</div>
                      {it.shelves.length === 0 && (
                        <div style={{ fontSize: 12, color: '#f97316', marginTop: 2 }}>棚未設定</div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* 取扱外リスト */}
        {pendingBuyback.length > 0 && (
          <div style={{
            background: '#fff', border: '2px solid #fed7aa', borderRadius: 10, overflow: 'hidden',
          }}>
            {/* ヘッダー */}
            <div style={{
              background: '#fff7ed', padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: '1px solid #fed7aa',
            }}>
              <input
                type="checkbox"
                checked={checkedIds.size === pendingBuyback.length && pendingBuyback.length > 0}
                onChange={toggleAll}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#c2410c', flex: 1 }}>
                取扱外リスト（{pendingBuyback.length}件）
              </span>
              {checkedIds.size > 0 && (
                <span style={{ fontSize: 12, color: '#f97316' }}>{checkedIds.size}件選択中</span>
              )}
            </div>

            {/* アイテム */}
            {pendingBuyback.map(b => (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', borderBottom: '1px solid #fef3c7',
              }}>
                <input
                  type="checkbox"
                  checked={checkedIds.has(b.id)}
                  onChange={() => toggleCheck(b.id)}
                  style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.content_name ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                    {b.product_no3} {b.title ? `/ ${b.title}` : ''}
                  </div>
                </div>
                {b.used_price != null && (
                  <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                    ¥{b.used_price.toLocaleString()}
                  </div>
                )}
              </div>
            ))}

            {/* ボタン */}
            <div style={{ padding: '12px 16px', display: 'flex', gap: 10, background: '#fff7ed' }}>
              <button
                onClick={handleMove}
                style={{
                  flex: 1, padding: '10px 0', background: '#2563eb', color: '#fff',
                  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                買戻し確認へ移動（{actionCount}件）
              </button>
              <button
                onClick={handleClear}
                style={{
                  padding: '10px 16px', background: '#fff', color: '#94a3b8',
                  border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                クリア（{actionCount}件）
              </button>
            </div>
          </div>
        )}

        {/* スキャン履歴 */}
        {history.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>最近のスキャン</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {history.map((h, i) => (
                <div key={i} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12,
                  background:
                    h.status === 'found'    ? '#dcfce7' :
                    h.status === 'no_shelf' ? '#fff7ed' : '#fee2e2',
                  color:
                    h.status === 'found'    ? '#15803d' :
                    h.status === 'no_shelf' ? '#c2410c' : '#b91c1c',
                  fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {h.shelfNo != null ? `棚${h.shelfNo}` : h.status === 'not_found' ? '×' : '棚?'}
                  <span style={{ fontWeight: 400, opacity: 0.8 }}>
                    {h.label.length > 10 ? h.label.slice(0, 10) + '…' : h.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
