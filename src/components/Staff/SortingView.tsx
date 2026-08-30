import { useEffect, useRef, useState, useCallback } from 'react'
import { useInventorySearch, type SearchMode } from '../../hooks/useInventorySearch'
import { isTriggerBarcode } from '../../lib/barcode'
import { getContentName, getShelfRouteLabel, getSearchDisplayName, getContentTypeName } from '../../lib/inventoryRouting'

interface Props {
  storeId: string
  storeName: string
}

interface HistoryEntry {
  query: string
  label: string   // コンテンツ名 or タイトル
  shelfNo: number | null
  status: 'found' | 'not_found' | 'out_of_scope' | 'no_shelf'
}

const MODE_LABELS: Record<SearchMode, string> = {
  barcode:      'バーコード',
  product_no:   '商品番号',
  content_name: 'コンテンツ名',
}

export function SortingView({ storeId, storeName }: Props) {
  const [mode, setMode] = useState<SearchMode>('barcode')
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const { result, loading, search, clear } = useInventorySearch(storeId)

  // 常に入力欄にフォーカス（バーコードモード）
  useEffect(() => {
    if (mode === 'barcode') inputRef.current?.focus()
  }, [mode, result])

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return
    await search(q, mode)
  }, [search, mode])

  const handleInput = useCallback((val: string) => {
    setInput(val)
    // バーコードモードのみ: 完全なバーコードを検出したら自動検索
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

  // 検索結果が来たら履歴に追加
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
    // バーコード・商品番号モードは入力欄にフォーカスを戻す
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

  // ─── 結果カードの色・メッセージ ───────────────────────────
  const statusStyle = (() => {
    if (!result) return null
    switch (result.status) {
      case 'found':       return { bg: '#dcfce7', border: '#16a34a', text: '#15803d' }
      case 'no_shelf':    return { bg: '#fff7ed', border: '#ea580c', text: '#c2410c' }
      case 'not_found':   return { bg: '#fee2e2', border: '#dc2626', text: '#b91c1c' }
      default:            return { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' }
    }
  })()

  const item = result?.items[0]
  const shelf = item?.shelves[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8f9fa', fontFamily: '"Noto Sans JP", sans-serif' }}>

      {/* ヘッダー */}
      <div style={{ background: '#1a2c6e', color: '#fff', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>在庫仕分け</span>
        <span style={{ fontSize: 13, opacity: 0.7 }}>{storeName}</span>
      </div>

      {/* モードタブ */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '2px solid #e2e8f0' }}>
        {(Object.keys(MODE_LABELS) as SearchMode[]).map(m => (
          <button
            key={m}
            onClick={() => changeMode(m)}
            style={{
              flex: 1,
              padding: '14px 8px',
              border: 'none',
              borderBottom: mode === m ? '3px solid #1a2c6e' : '3px solid transparent',
              background: 'none',
              color: mode === m ? '#1a2c6e' : '#64748b',
              fontWeight: mode === m ? 700 : 400,
              fontSize: 15,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* 入力エリア */}
      <div style={{ padding: '16px 20px', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: 10 }}>
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
              flex: 1,
              padding: '14px 18px',
              fontSize: 18,
              border: '2px solid #c8a84b',
              borderRadius: 10,
              outline: 'none',
              fontFamily: 'inherit',
            }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {mode !== 'barcode' && (
            <button
              onClick={() => { handleSearch(input); if (mode !== 'content_name') setInput('') }}
              style={{
                padding: '14px 24px',
                background: '#1a2c6e',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              検索
            </button>
          )}
        </div>
        {mode === 'barcode' && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#94a3b8' }}>
            スキャンすると自動的に検索します
          </p>
        )}
      </div>

      {/* 結果エリア */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

        {/* ローディング */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 18 }}>
            検索中...
          </div>
        )}

        {/* 結果カード（バーコード・商品番号モード） */}
        {!loading && result && mode !== 'content_name' && statusStyle && (
          <div style={{
            background: statusStyle.bg,
            border: `3px solid ${statusStyle.border}`,
            borderRadius: 16,
            padding: '28px 32px',
            marginBottom: 20,
            textAlign: 'center',
          }}>
            {result.status === 'found' && shelf ? (
              <>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>棚番号</div>
                <div style={{ fontSize: 96, fontWeight: 900, color: statusStyle.text, lineHeight: 1.1 }}>
                  {shelf.shelf_no}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', marginTop: 12 }}>
                  {item ? getContentName(item) : '—'}
                </div>
                <div style={{ fontSize: 15, color: '#64748b', marginTop: 4 }}>
                  {item?.category_name} / {item?.title}
                </div>
              </>
            ) : result.status === 'no_shelf' ? (
              <>
                <div style={{ fontSize: 48, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: statusStyle.text }}>棚未設定</div>
                <div style={{ fontSize: 18, color: '#1e293b', marginTop: 10 }}>
                  {item ? getContentName(item) : '—'}
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
                  → {item ? getShelfRouteLabel(item) : ''}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 48, marginBottom: 8 }}>✕</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: statusStyle.text }}>在庫なし</div>
                <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>
                  「{result.query}」はデータに存在しません
                </div>
              </>
            )}
          </div>
        )}

        {/* コンテンツ名検索結果（複数表示） */}
        {!loading && result && mode === 'content_name' && (
          <div>
            {result.status === 'not_found' ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#dc2626', fontSize: 20, fontWeight: 700 }}>
                「{result.query}」に該当するコンテンツが見つかりません
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                  {result.items.length}件のジャンルが見つかりました
                </div>
                {result.items.map((it, i) => (
                  <div key={i} style={{
                    background: '#fff',
                    border: '2px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '16px 20px',
                    marginBottom: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                  }}>
                    <div style={{
                      minWidth: 64,
                      height: 64,
                      background: it.shelves.length > 0 ? '#dcfce7' : '#fff7ed',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 28,
                      fontWeight: 900,
                      color: it.shelves.length > 0 ? '#15803d' : '#c2410c',
                    }}>
                      {it.shelves[0]?.shelf_no ?? '—'}
                    </div>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#1e293b' }}>
                        {getSearchDisplayName(it)}
                      </div>
                      <div style={{ fontSize: 14, color: '#475569', marginTop: 2, fontWeight: 600 }}>
                        {getContentTypeName(it)}
                      </div>
                      {it.genre_label && it.genre_label !== it.content_name && getContentTypeName(it) !== 'キャラクターグッズ' && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                          {it.genre_label}
                        </div>
                      )}
                      {it.shelves.length === 0 && (
                        <div style={{ fontSize: 12, color: '#f97316', marginTop: 2 }}>
                          棚未設定
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* スキャン履歴 */}
        {history.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600, letterSpacing: '0.05em' }}>
              最近のスキャン
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {history.map((h, i) => (
                <div key={i} style={{
                  padding: '6px 12px',
                  borderRadius: 20,
                  fontSize: 13,
                  background:
                    h.status === 'found'     ? '#dcfce7' :
                    h.status === 'no_shelf'  ? '#fff7ed' : '#fee2e2',
                  color:
                    h.status === 'found'     ? '#15803d' :
                    h.status === 'no_shelf'  ? '#c2410c' : '#b91c1c',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
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
