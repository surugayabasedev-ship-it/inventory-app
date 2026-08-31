import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { read as XLSXRead, utils as XLSXUtils, writeFile as XLSXWriteFile } from 'xlsx'
import { AdminLayout } from './AdminLayout'

interface Shelf {
  shelf_id: string
  shelf_no: number
  x: number
  y: number
  shelf_category: string | null
}

interface ShelfContent {
  id: string
  shelf_id: string
  content_id: string | null
  is_catch_all: boolean
  display_order: number
  contents: { content_name: string; area: string | null } | null
}

interface ContentItem {
  id: string
  content_name: string
  area: string | null
}

interface Props {
  storeId: string
  storeName: string
  storeCode: string
}

const CATCH_ALL_KEYWORDS = ['その他', '50音', 'その他ﾌｧﾝｼｰ', '他ファンシー', '他ﾌｧﾝｼｰ']
function isCatchAll(name: string) {
  return CATCH_ALL_KEYWORDS.some(kw => name.includes(kw))
}

interface AreaColor { bg: string; bd: string; tx: string }
const AREA_COLORS: Record<string, AreaColor> = {
  'フィギュア':         { bg: '#bfdbfe', bd: '#93c5fd', tx: '#1e40af' },
  'プラモ':             { bg: '#bae6fd', bd: '#7dd3fc', tx: '#0c4a6e' },
  'トレカ':             { bg: '#bbf7d0', bd: '#86efac', tx: '#14532d' },
  'ゲーム':             { bg: '#fde68a', bd: '#fcd34d', tx: '#78350f' },
  '鉄道/ミニカー/トイ':     { bg: '#fed7aa', bd: '#fdba74', tx: '#7c2d12' },
  'ぬいぐるみ':         { bg: '#e9d5ff', bd: '#d8b4fe', tx: '#581c87' },
  'キャラクターグッズ': { bg: '#fecdd3', bd: '#fda4af', tx: '#881337' },
}
const AREA_LIST = Object.keys(AREA_COLORS)
const NO_CAT: AreaColor = { bg: '#f1f5f9', bd: '#cbd5e1', tx: '#64748b' }

function areaColor(cat: string | null): AreaColor {
  return cat ? (AREA_COLORS[cat] ?? NO_CAT) : NO_CAT
}

function AreaBadge({ area }: { area: string | null }) {
  if (!area) return null
  const c = AREA_COLORS[area]
  if (!c) return null
  return (
    <span style={{ fontSize:10, background:c.bg, color:c.tx, border:`1px solid ${c.bd}`, borderRadius:3, padding:'1px 5px', whiteSpace:'nowrap', flexShrink:0 }}>
      {area}
    </span>
  )
}

function btn(bg: string, disabled = false): React.CSSProperties {
  return {
    background: disabled ? '#334155' : bg,
    color: disabled ? '#64748b' : '#fff',
    border: 'none', borderRadius: 6,
    padding: '8px 14px', fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: '"Noto Sans JP", sans-serif', fontWeight: 600, whiteSpace: 'nowrap',
  }
}

const CELL_W = 52
const CELL_H = 36
const DETAIL_W = 320
const UNDO_MS = 5000

export function ShelvesAdmin({ storeId, storeName, storeCode }: Props) {
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [scMap, setScMap] = useState<Map<string, ShelfContent[]>>(new Map())
  const [allContents, setAllContents] = useState<ContentItem[]>([])
  const [selected, setSelected] = useState<Shelf | null>(null)
  const [loading, setLoading] = useState(true)
  const [importMsg, setImportMsg] = useState('')
  const [addCatchAll, setAddCatchAll] = useState(false)
  const [editCategory, setEditCategory] = useState('')
  const [contentSearch, setContentSearch] = useState('')
  const [contentAreaFilter, setContentAreaFilter] = useState('')
  const [selectedAddContent, setSelectedAddContent] = useState<ContentItem | null>(null)
  const [mapSearch, setMapSearch] = useState('')
  const [undoItem, setUndoItem] = useState<ShelfContent | null>(null)
  const [undoProgress, setUndoProgress] = useState(0)

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [storeId])
  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current)
  }, [])

  async function load() {
    setLoading(true)
    const { data: shelvesData } = await supabase
      .from('shelves')
      .select('shelf_id, shelf_no, x, y, shelf_category')
      .eq('store_id', storeId)
    const shelfList: Shelf[] = shelvesData ?? []
    setShelves(shelfList)

    if (shelfList.length > 0) {
      const ids = shelfList.map(s => s.shelf_id)
      const allSc: ShelfContent[] = []
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase
          .from('shelf_contents')
          .select('id, shelf_id, content_id, is_catch_all, display_order, contents(content_name, area)')
          .in('shelf_id', ids.slice(i, i + 100))
        for (const row of data ?? []) allSc.push(row as unknown as ShelfContent)
      }
      const map = new Map<string, ShelfContent[]>()
      for (const sc of allSc) {
        const arr = map.get(sc.shelf_id) ?? []
        arr.push(sc)
        map.set(sc.shelf_id, arr)
      }
      for (const arr of map.values()) arr.sort((a, b) => a.display_order - b.display_order)
      setScMap(map)
    }

    const { data: cd } = await supabase
      .from('contents')
      .select('id, content_name, area')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('content_name')
    setAllContents(cd ?? [])
    setLoading(false)
  }

  const selectedContents = selected ? (scMap.get(selected.shelf_id) ?? []) : []

  function selectShelf(shelf: Shelf) {
    setSelected(shelf)
    setEditCategory(shelf.shelf_category ?? '')
    setContentSearch('')
    setContentAreaFilter('')
    setSelectedAddContent(null)
    setAddCatchAll(false)
  }

  async function saveCategory() {
    if (!selected) return
    const { error } = await supabase
      .from('shelves')
      .update({ shelf_category: editCategory || null })
      .eq('shelf_id', selected.shelf_id)
    if (error) return
    const updated = { ...selected, shelf_category: editCategory || null }
    setShelves(prev => prev.map(s => s.shelf_id === selected.shelf_id ? updated : s))
    setSelected(updated)
  }

  function removeContent(sc: ShelfContent) {
    if (undoTimerRef.current && undoItem) {
      clearTimeout(undoTimerRef.current)
      clearInterval(undoIntervalRef.current!)
      supabase.from('shelf_contents').delete().eq('id', undoItem.id)
    }
    setScMap(prev => {
      const next = new Map(prev)
      next.set(sc.shelf_id, (next.get(sc.shelf_id) ?? []).filter(c => c.id !== sc.id))
      return next
    })
    setUndoItem(sc)
    setUndoProgress(100)
    const start = Date.now()
    undoIntervalRef.current = setInterval(() => {
      setUndoProgress(Math.max(0, 100 - ((Date.now() - start) / UNDO_MS) * 100))
    }, 50)
    undoTimerRef.current = setTimeout(() => {
      supabase.from('shelf_contents').delete().eq('id', sc.id)
      setUndoItem(null)
      clearInterval(undoIntervalRef.current!)
    }, UNDO_MS)
  }

  function undoRemove() {
    if (!undoItem) return
    clearTimeout(undoTimerRef.current!)
    clearInterval(undoIntervalRef.current!)
    setScMap(prev => {
      const next = new Map(prev)
      const arr = [...(next.get(undoItem.shelf_id) ?? []), undoItem]
      arr.sort((a, b) => a.display_order - b.display_order)
      next.set(undoItem.shelf_id, arr)
      return next
    })
    setUndoItem(null)
    setUndoProgress(0)
  }

  async function addContent() {
    if (!selected) return
    if (!addCatchAll && !selectedAddContent) return
    const order = selectedContents.length
    const contentId = addCatchAll ? null : selectedAddContent!.id
    const { data, error } = await supabase
      .from('shelf_contents')
      .insert({ shelf_id: selected.shelf_id, content_id: contentId, is_catch_all: addCatchAll, display_order: order })
      .select('id, shelf_id, content_id, is_catch_all, display_order, contents(content_name, area)')
      .single()
    if (error || !data) return
    setScMap(prev => {
      const next = new Map(prev)
      next.set(selected.shelf_id, [...(next.get(selected.shelf_id) ?? []), data as unknown as ShelfContent])
      return next
    })
    setContentSearch('')
    setSelectedAddContent(null)
    setAddCatchAll(false)
  }

  function exportXlsx() {
    const rows: (string | number)[][] = [['棚番号', '分類', '', '', '', '', 'コンテンツ名（7列目以降）']]
    for (const shelf of [...shelves].sort((a, b) => a.shelf_no - b.shelf_no)) {
      const scs = scMap.get(shelf.shelf_id) ?? []
      if (scs.length === 0) {
        rows.push([shelf.shelf_no, shelf.shelf_category ?? '', '', '', '', ''])
        continue
      }
      // 同一棚でエリアが異なる場合は複数行に分割
      const byArea = new Map<string, string[]>()
      for (const sc of scs) {
        const area = sc.is_catch_all ? 'その他' : (sc.contents?.area ?? shelf.shelf_category ?? '')
        const name = sc.is_catch_all ? 'その他' : (sc.contents?.content_name ?? '')
        const arr = byArea.get(area) ?? []
        arr.push(name)
        byArea.set(area, arr)
      }
      for (const [area, names] of byArea) {
        rows.push([shelf.shelf_no, area, '', '', '', '', ...names])
      }
    }
    const ws = XLSXUtils.aoa_to_sheet(rows)
    const wb = XLSXUtils.book_new()
    XLSXUtils.book_append_sheet(wb, ws, 'list')
    XLSXWriteFile(wb, `棚割_${storeName}.xlsx`)
  }

  async function importXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportMsg('読み込み中...')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSXRead(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSXUtils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '' })
      const shelfMap = new Map<number, string>()
      for (const s of shelves) shelfMap.set(s.shelf_no, s.shelf_id)
      // name+area複合キーで同名・異分類コンテンツを区別
      const { data: allC } = await supabase.from('contents').select('id, content_name, area').eq('store_id', storeId)
      const contentMap = new Map<string, string>()
      for (const c of allC ?? []) {
        contentMap.set(`${c.content_name}__${c.area ?? ''}`, c.id)
        if (!contentMap.has(c.content_name)) contentMap.set(c.content_name, c.id) // フォールバック
      }
      setImportMsg('既存データ削除中...')
      const ids = [...shelfMap.values()]
      for (let i = 0; i < ids.length; i += 100) {
        await supabase.from('shelf_contents').delete().in('shelf_id', ids.slice(i, i + 100))
      }
      const records: Record<string, unknown>[] = []
      // 棚ごとに最初の分類のみ shelf_category を更新（混在時は上書きしない）
      const categoryUpdates = new Map<string, string>()
      let displayOrderMap = new Map<string, number>()
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]
        const shelfNo = typeof r[0] === 'number' ? r[0] : parseInt(String(r[0]))
        if (!shelfNo || isNaN(shelfNo)) continue
        const shelfId = shelfMap.get(shelfNo)
        if (!shelfId) continue
        const rowArea = String(r[1] || '').trim()
        if (rowArea && !categoryUpdates.has(shelfId)) categoryUpdates.set(shelfId, rowArea)
        const cols = Array.from(r).slice(6).map(v => String(v || '').trim()).filter(Boolean)
        cols.forEach(name => {
          const order = displayOrderMap.get(shelfId) ?? 0
          const contentId = contentMap.get(`${name}__${rowArea}`) ?? contentMap.get(name) ?? null
          records.push({ shelf_id: shelfId, content_id: contentId, is_catch_all: isCatchAll(name), display_order: order })
          displayOrderMap.set(shelfId, order + 1)
        })
      }
      for (const [shelf_id, category] of categoryUpdates) {
        await supabase.from('shelves').update({ shelf_category: category }).eq('shelf_id', shelf_id)
      }
      setImportMsg(`${records.length}件 投入中...`)
      for (let i = 0; i < records.length; i += 500) {
        await supabase.from('shelf_contents').insert(records.slice(i, i + 500))
      }
      setImportMsg(`完了: ${records.length}件`)
      if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (err) {
      setImportMsg('エラーが発生しました')
      console.error(err)
    }
  }

  const mapSearchTrimmed = mapSearch.trim()
  const matchedShelfIds = useCallback(() => {
    if (!mapSearchTrimmed) return new Set<string>()
    const result = new Set<string>()
    for (const [shelfId, scs] of scMap) {
      if (scs.some(sc => sc.contents?.content_name.includes(mapSearchTrimmed) || (sc.is_catch_all && 'その他'.includes(mapSearchTrimmed)))) {
        result.add(shelfId)
      }
    }
    return result
  }, [scMap, mapSearchTrimmed])()

  const filteredContents = contentSearch.trim()
    ? allContents
        .filter(c => c.content_name.includes(contentSearch.trim()))
        .filter(c => !contentAreaFilter || c.area === contentAreaFilter)
        .slice(0, 30)
    : []

  const maxX = shelves.length > 0 ? Math.max(...shelves.map(s => s.x)) : 1
  const maxY = shelves.length > 0 ? Math.max(...shelves.map(s => s.y)) : 1

  if (loading) return (
    <AdminLayout storeName={storeName} storeCode={storeCode} currentPage="shelves">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#94a3b8', fontFamily:'"Noto Sans JP",sans-serif' }}>
        読み込み中...
      </div>
    </AdminLayout>
  )

  return (
    <AdminLayout storeName={storeName} storeCode={storeCode} currentPage="shelves">
      <div style={{ padding:24, fontFamily:'"Noto Sans JP",sans-serif', height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column', gap:16 }}>

        {/* ヘッダー */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <h1 style={{ margin:0, fontSize:20, fontWeight:700, color:'#1e293b' }}>棚割管理</h1>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {importMsg && <span style={{ fontSize:13, color:'#64748b' }}>{importMsg}</span>}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={importXlsx} />
            <button onClick={() => fileRef.current?.click()} style={btn('#1e293b')}>Excel一括インポート</button>
            <button onClick={exportXlsx} style={btn('#2563eb')}>Excelエクスポート</button>
          </div>
        </div>

        {/* メイン */}
        <div style={{ display:'flex', gap:16, flex:1, overflow:'hidden' }}>

          {/* マップエリア */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8, overflow:'hidden' }}>

            {/* マップ検索バー */}
            <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
              <div style={{ position:'relative', flex:1 }}>
                <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', fontSize:14 }}>🔍</span>
                <input
                  type="text"
                  value={mapSearch}
                  onChange={e => setMapSearch(e.target.value)}
                  placeholder="コンテンツ名でマップ上の棚を検索..."
                  style={{ width:'100%', boxSizing:'border-box', padding:'8px 12px 8px 32px', borderRadius:6, border:'1px solid #d1d5db', fontSize:13, fontFamily:'"Noto Sans JP",sans-serif', outline:'none' }}
                />
                {mapSearch && (
                  <button onClick={() => setMapSearch('')} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', border:'none', background:'none', cursor:'pointer', color:'#94a3b8', fontSize:16, padding:0, lineHeight:1 }}>×</button>
                )}
              </div>
              {mapSearchTrimmed && (
                <span style={{ fontSize:12, color: matchedShelfIds.size > 0 ? '#0891b2' : '#ef4444', whiteSpace:'nowrap', flexShrink:0 }}>
                  {matchedShelfIds.size > 0 ? `${matchedShelfIds.size}棚 ヒット` : '見つかりません'}
                </span>
              )}
            </div>

            {/* マップ本体 */}
            <div style={{ flex:1, overflow:'auto', background:'#f8fafc', borderRadius:8, padding:12, border:'1px solid #e2e8f0' }}>

              {/* 凡例（上部） */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 10px', marginBottom:10, padding:'8px 12px', background:'#fff', borderRadius:6, border:'1px solid #e2e8f0' }}>
                {AREA_LIST.map(a => {
                  const c = AREA_COLORS[a]
                  return (
                    <div key={a} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#475569' }}>
                      <div style={{ width:12, height:12, borderRadius:2, background:c.bg, border:`1px solid ${c.bd}`, flexShrink:0 }} />
                      {a}
                    </div>
                  )
                })}
                <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#475569' }}>
                  <div style={{ width:12, height:12, borderRadius:2, background:NO_CAT.bg, border:`1px solid ${NO_CAT.bd}`, flexShrink:0 }} />
                  未設定
                </div>
              </div>

              <div style={{ fontSize:11, color:'#94a3b8', marginBottom:8 }}>
                {shelves.length}棚 | グリッド {maxY}列 × {maxX}行 | 棚をクリックして選択
              </div>

              <div style={{
                display:'grid',
                gridTemplateColumns:`repeat(${maxY}, ${CELL_W}px)`,
                gridTemplateRows:`repeat(${maxX}, ${CELL_H}px)`,
                gap:2,
                width:'fit-content',
              }}>
                {shelves.map(shelf => {
                  const scs = scMap.get(shelf.shelf_id) ?? []
                  const isSelected = selected?.shelf_id === shelf.shelf_id
                  const isMatched = mapSearchTrimmed ? matchedShelfIds.has(shelf.shelf_id) : false
                  const isDimmed = mapSearchTrimmed && !isMatched
                  const ac = isSelected ? { bg: '#2563eb', bd: '#1d4ed8', tx: '#fff' } : areaColor(shelf.shelf_category)

                  // 複数エリアのドット表示用
                  const subAreas = [...new Set(scs.map(sc => sc.contents?.area).filter((a): a is string => !!a && a !== shelf.shelf_category))]

                  return (
                    <div
                      key={shelf.shelf_id}
                      onClick={() => selectShelf(shelf)}
                      title={`棚${shelf.shelf_no} [${shelf.shelf_category ?? '未設定'}]\n${scs.map(c => c.is_catch_all ? 'その他' : (c.contents?.content_name ?? '')).join(', ')}`}
                      style={{
                        gridColumn: shelf.y,
                        gridRow: shelf.x,
                        background: ac.bg,
                        border: isMatched && !isSelected
                          ? '2px solid #f59e0b'
                          : `1px solid ${ac.bd}`,
                        borderRadius: 3,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 600,
                        color: ac.tx,
                        userSelect: 'none',
                        opacity: isDimmed ? 0.25 : 1,
                        boxShadow: isSelected ? `0 0 0 2px ${ac.bd}` : undefined,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <span>{shelf.shelf_no}</span>
                      {scs.length > 0 && (
                        <span style={{ fontSize:8, background: isSelected ? 'rgba(255,255,255,0.35)' : '#64748b', color:'#fff', borderRadius:6, padding:'0 3px', lineHeight:'12px', marginTop:1 }}>
                          {scs.length}
                        </span>
                      )}
                      {/* 複数エリアドット */}
                      {subAreas.length > 0 && (
                        <div style={{ position:'absolute', bottom:2, right:2, display:'flex', gap:1 }}>
                          {subAreas.slice(0,3).map(a => {
                            const dc = AREA_COLORS[a]
                            return dc ? <div key={a} style={{ width:4, height:4, borderRadius:'50%', background:dc.bd }} /> : null
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 詳細パネル */}
          <div style={{ width:DETAIL_W, flexShrink:0, background:'#fff', borderRadius:8, border:'1px solid #e2e8f0', overflow:'auto', display:'flex', flexDirection:'column' }}>
            {selected ? (
              <div style={{ padding:16 }}>
                <div style={{ fontWeight:700, fontSize:17, color:'#1e293b', marginBottom:4 }}>棚 {selected.shelf_no}</div>
                <div style={{ fontSize:11, color:'#94a3b8', marginBottom:14 }}>座標 ({selected.x}, {selected.y})</div>

                {/* 棚エリア設定 */}
                <div style={{ background:'#f8fafc', borderRadius:6, padding:'10px 12px', marginBottom:14, border:'1px solid #e2e8f0' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:3 }}>棚エリア設定</div>
                  <div style={{ fontSize:11, color:'#94a3b8', marginBottom:8 }}>マップの色分けに使用します</div>
                  <div style={{ display:'flex', gap:6 }}>
                    <select
                      value={editCategory}
                      onChange={e => setEditCategory(e.target.value)}
                      style={{ fontSize:12, padding:'6px 8px', borderRadius:4, border:'1px solid #d1d5db', flex:1, fontFamily:'"Noto Sans JP",sans-serif' }}
                    >
                      <option value="">未設定</option>
                      {AREA_LIST.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <button onClick={saveCategory} style={btn('#0891b2')}>保存</button>
                  </div>
                </div>

                {/* 所属コンテンツ */}
                <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:8 }}>所属コンテンツ</div>

                {/* Undo バナー */}
                {undoItem && undoItem.shelf_id === selected.shelf_id && (
                  <div style={{ background:'#1e293b', borderRadius:6, padding:'8px 10px', marginBottom:8, display:'flex', flexDirection:'column', gap:4 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                      <span style={{ fontSize:12, color:'#e2e8f0', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        「{undoItem.is_catch_all ? 'その他/50音' : (undoItem.contents?.content_name ?? '')}」を削除
                      </span>
                      <button
                        onClick={undoRemove}
                        style={{ background:'#f59e0b', color:'#fff', border:'none', borderRadius:4, padding:'3px 10px', fontSize:12, cursor:'pointer', fontWeight:700, fontFamily:'"Noto Sans JP",sans-serif', flexShrink:0 }}
                      >
                        元に戻す
                      </button>
                    </div>
                    <div style={{ height:3, background:'#334155', borderRadius:2 }}>
                      <div style={{ height:'100%', background:'#f59e0b', borderRadius:2, width:`${undoProgress}%`, transition:'width 0.1s linear' }} />
                    </div>
                  </div>
                )}

                {selectedContents.length === 0 && (
                  <div style={{ fontSize:12, color:'#94a3b8', marginBottom:12, padding:'8px 0' }}>なし</div>
                )}
                {selectedContents.map(sc => (
                  <div key={sc.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #f1f5f9', gap:6 }}>
                    <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:3 }}>
                      <span style={{ fontSize:13, color: sc.is_catch_all ? '#7c3aed' : (sc.content_id ? '#1e293b' : '#94a3b8'), overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {sc.is_catch_all ? '【その他/50音】' : (sc.contents?.content_name ?? '(未マッチ)')}
                      </span>
                      {!sc.is_catch_all && <AreaBadge area={sc.contents?.area ?? null} />}
                    </div>
                    <button
                      onClick={() => removeContent(sc)}
                      title="削除（5秒間は元に戻せます）"
                      style={{ border:'none', background:'none', cursor:'pointer', color:'#ef4444', fontSize:16, padding:'0 4px', flexShrink:0, lineHeight:1 }}
                    >×</button>
                  </div>
                ))}

                {/* コンテンツ追加 */}
                <div style={{ marginTop:20, fontSize:13, fontWeight:700, color:'#374151', marginBottom:10 }}>コンテンツ追加</div>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#64748b', marginBottom:10, cursor:'pointer' }}>
                  <input type="checkbox" checked={addCatchAll} onChange={e => { setAddCatchAll(e.target.checked); setContentSearch(''); setSelectedAddContent(null) }} />
                  その他/50音棚として追加
                </label>
                {!addCatchAll && (
                  <div style={{ marginBottom:8 }}>
                    {selectedAddContent ? (
                      /* 選択済み表示 */
                      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 8px', background:'#eff6ff', border:'1px solid #93c5fd', borderRadius:4 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, color:'#1d4ed8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {selectedAddContent.content_name}
                          </div>
                          <AreaBadge area={selectedAddContent.area} />
                        </div>
                        <button
                          onClick={() => { setSelectedAddContent(null); setContentSearch(''); setContentAreaFilter('') }}
                          style={{ border:'none', background:'none', cursor:'pointer', color:'#94a3b8', fontSize:14, padding:0, lineHeight:1 }}
                        >×</button>
                      </div>
                    ) : (
                      <>
                        {/* エリアフィルター */}
                        <select
                          value={contentAreaFilter}
                          onChange={e => setContentAreaFilter(e.target.value)}
                          style={{ width:'100%', padding:'6px 8px', borderRadius:4, border:'1px solid #d1d5db', fontSize:12, fontFamily:'"Noto Sans JP",sans-serif', marginBottom:4, color: contentAreaFilter ? '#1e293b' : '#94a3b8' }}
                        >
                          <option value="">分類で絞り込み（任意）</option>
                          {AREA_LIST.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        {/* コンテンツ名検索 */}
                        <div style={{ position:'relative' }}>
                          <input
                            type="text"
                            value={contentSearch}
                            onChange={e => setContentSearch(e.target.value)}
                            placeholder="コンテンツ名を検索..."
                            style={{ width:'100%', boxSizing:'border-box', padding:'7px 8px', borderRadius:4, border:'1px solid #d1d5db', fontSize:12, fontFamily:'"Noto Sans JP",sans-serif', outline:'none' }}
                          />
                          {filteredContents.length > 0 && (
                            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #d1d5db', borderTop:'none', borderRadius:'0 0 4px 4px', maxHeight:200, overflowY:'auto', zIndex:10, boxShadow:'0 4px 8px rgba(0,0,0,0.1)' }}>
                              {filteredContents.map(c => {
                                const ac = c.area ? AREA_COLORS[c.area] : null
                                return (
                                  <div
                                    key={c.id}
                                    onMouseDown={() => { setSelectedAddContent(c); setContentSearch('') }}
                                    style={{ padding:'6px 10px', fontSize:12, cursor:'pointer', color:'#1e293b', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                                  >
                                    <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.content_name}</span>
                                    {ac && (
                                      <span style={{ fontSize:10, background:ac.bg, color:ac.tx, border:`1px solid ${ac.bd}`, borderRadius:3, padding:'1px 5px', whiteSpace:'nowrap', flexShrink:0 }}>
                                        {c.area}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {contentSearch.trim() && filteredContents.length === 0 && (
                            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #d1d5db', borderTop:'none', borderRadius:'0 0 4px 4px', padding:'8px 10px', fontSize:12, color:'#94a3b8', zIndex:10 }}>
                              見つかりません
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <button
                  onClick={addContent}
                  disabled={!addCatchAll && !selectedAddContent}
                  style={{ ...btn('#16a34a', !addCatchAll && !selectedAddContent), width:'100%' }}
                >
                  追加
                </button>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'#94a3b8', fontSize:13, textAlign:'center', padding:24 }}>
                左のマップから<br />棚を選択してください
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
