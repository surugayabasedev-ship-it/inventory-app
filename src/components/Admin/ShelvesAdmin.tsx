import { useEffect, useState, useRef } from 'react'
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
  contents: { content_name: string } | null
}

interface ContentItem {
  id: string
  content_name: string
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

const PALETTE = ['#dbeafe','#dcfce7','#fce7f3','#fef3c7','#f3e8ff','#ffedd5','#e0f2fe','#ecfdf5','#fef9c3','#fce7f3']
function categoryColor(cat: string | null) {
  if (!cat) return '#f1f5f9'
  let h = 0
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function btn(bg: string, disabled = false): React.CSSProperties {
  return {
    background: disabled ? '#94a3b8' : bg,
    color: '#fff', border: 'none', borderRadius: 6,
    padding: '8px 14px', fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: '"Noto Sans JP", sans-serif', fontWeight: 600, whiteSpace: 'nowrap',
  }
}

const CELL_W = 52
const CELL_H = 36
const DETAIL_W = 300

export function ShelvesAdmin({ storeId, storeName, storeCode }: Props) {
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [scMap, setScMap] = useState<Map<string, ShelfContent[]>>(new Map())
  const [allContents, setAllContents] = useState<ContentItem[]>([])
  const [selected, setSelected] = useState<Shelf | null>(null)
  const [loading, setLoading] = useState(true)
  const [importMsg, setImportMsg] = useState('')
  const [addId, setAddId] = useState('')
  const [addCatchAll, setAddCatchAll] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [storeId])

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
          .select('id, shelf_id, content_id, is_catch_all, display_order, contents(content_name)')
          .in('shelf_id', ids.slice(i, i + 100))
        for (const row of data ?? []) allSc.push(row as ShelfContent)
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
      .select('id, content_name')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('content_name')
    setAllContents(cd ?? [])
    setLoading(false)
  }

  const selectedContents = selected ? (scMap.get(selected.shelf_id) ?? []) : []

  async function removeContent(sc: ShelfContent) {
    const { error } = await supabase.from('shelf_contents').delete().eq('id', sc.id)
    if (error) return
    setScMap(prev => {
      const next = new Map(prev)
      next.set(sc.shelf_id, (next.get(sc.shelf_id) ?? []).filter(c => c.id !== sc.id))
      return next
    })
  }

  async function addContent() {
    if (!selected) return
    if (!addCatchAll && !addId) return
    const order = selectedContents.length
    const { data, error } = await supabase
      .from('shelf_contents')
      .insert({ shelf_id: selected.shelf_id, content_id: addCatchAll ? null : addId, is_catch_all: addCatchAll, display_order: order })
      .select('id, shelf_id, content_id, is_catch_all, display_order, contents(content_name)')
      .single()
    if (error || !data) return
    setScMap(prev => {
      const next = new Map(prev)
      next.set(selected.shelf_id, [...(next.get(selected.shelf_id) ?? []), data as ShelfContent])
      return next
    })
    setAddId('')
    setAddCatchAll(false)
  }

  function exportXlsx() {
    const rows: (string | number)[][] = [['棚番号', '', '', '', '', '', 'コンテンツ名（7列目以降）']]
    for (const shelf of [...shelves].sort((a, b) => a.shelf_no - b.shelf_no)) {
      const names = (scMap.get(shelf.shelf_id) ?? []).map(sc =>
        sc.is_catch_all ? 'その他' : (sc.contents?.content_name ?? '')
      )
      rows.push([shelf.shelf_no, '', '', '', '', '', ...names])
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
      const { data: allC } = await supabase.from('contents').select('id, content_name').eq('store_id', storeId)
      const contentMap = new Map<string, string>()
      for (const c of allC ?? []) contentMap.set(c.content_name, c.id)

      setImportMsg('既存データ削除中...')
      const ids = [...shelfMap.values()]
      for (let i = 0; i < ids.length; i += 100) {
        await supabase.from('shelf_contents').delete().in('shelf_id', ids.slice(i, i + 100))
      }

      const records: Record<string, unknown>[] = []
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]
        const shelfNo = typeof r[0] === 'number' ? r[0] : parseInt(String(r[0]))
        if (!shelfNo || isNaN(shelfNo)) continue
        const shelfId = shelfMap.get(shelfNo)
        if (!shelfId) continue
        const cols = Array.from(r).slice(6).map(v => String(v || '').trim()).filter(Boolean)
        cols.forEach((name, order) => {
          records.push({ shelf_id: shelfId, content_id: contentMap.get(name) ?? null, is_catch_all: isCatchAll(name), display_order: order })
        })
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

          {/* マップ */}
          <div style={{ flex:1, overflow:'auto', background:'#f8fafc', borderRadius:8, padding:12, border:'1px solid #e2e8f0' }}>
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
                const contents = scMap.get(shelf.shelf_id) ?? []
                const isSelected = selected?.shelf_id === shelf.shelf_id
                const bg = isSelected ? '#2563eb' : categoryColor(shelf.shelf_category)
                return (
                  <div
                    key={shelf.shelf_id}
                    onClick={() => setSelected(shelf)}
                    title={`棚${shelf.shelf_no} [${shelf.shelf_category ?? ''}]\n${contents.map(c => c.is_catch_all ? 'その他' : (c.contents?.content_name ?? '')).join(', ')}`}
                    style={{
                      gridColumn: shelf.y,
                      gridRow: shelf.x,
                      background: bg,
                      border: isSelected ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
                      borderRadius:3,
                      cursor:'pointer',
                      display:'flex',
                      flexDirection:'column',
                      alignItems:'center',
                      justifyContent:'center',
                      fontSize:10,
                      fontWeight:600,
                      color: isSelected ? '#fff' : '#334155',
                      userSelect:'none',
                    }}
                  >
                    <span>{shelf.shelf_no}</span>
                    {contents.length > 0 && (
                      <span style={{ fontSize:8, background: isSelected ? 'rgba(255,255,255,0.35)' : '#64748b', color:'#fff', borderRadius:6, padding:'0 3px', lineHeight:'12px', marginTop:1 }}>
                        {contents.length}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 詳細パネル */}
          <div style={{ width:DETAIL_W, flexShrink:0, background:'#fff', borderRadius:8, border:'1px solid #e2e8f0', overflow:'auto', display:'flex', flexDirection:'column' }}>
            {selected ? (
              <div style={{ padding:16 }}>
                <div style={{ fontWeight:700, fontSize:17, color:'#1e293b', marginBottom:2 }}>棚 {selected.shelf_no}</div>
                <div style={{ fontSize:12, color:'#64748b', marginBottom:16 }}>
                  {selected.shelf_category ?? '分類なし'} | 座標 ({selected.x}, {selected.y})
                </div>

                <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:8 }}>所属コンテンツ</div>
                {selectedContents.length === 0 && (
                  <div style={{ fontSize:12, color:'#94a3b8', marginBottom:12, padding:'8px 0' }}>なし</div>
                )}
                {selectedContents.map(sc => (
                  <div key={sc.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #f1f5f9', gap:8 }}>
                    <span style={{ fontSize:13, color: sc.is_catch_all ? '#7c3aed' : (sc.content_id ? '#1e293b' : '#94a3b8'), flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {sc.is_catch_all ? '【その他/50音】' : (sc.contents?.content_name ?? '(未マッチ)')}
                    </span>
                    <button onClick={() => removeContent(sc)} style={{ border:'none', background:'none', cursor:'pointer', color:'#ef4444', fontSize:16, padding:'0 4px', flexShrink:0, lineHeight:1 }}>×</button>
                  </div>
                ))}

                <div style={{ marginTop:20, fontSize:13, fontWeight:700, color:'#374151', marginBottom:10 }}>コンテンツ追加</div>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#64748b', marginBottom:8, cursor:'pointer' }}>
                  <input type="checkbox" checked={addCatchAll} onChange={e => { setAddCatchAll(e.target.checked); setAddId('') }} />
                  その他/50音棚として追加
                </label>
                {!addCatchAll && (
                  <select
                    value={addId}
                    onChange={e => setAddId(e.target.value)}
                    style={{ fontSize:12, padding:'7px 8px', borderRadius:4, border:'1px solid #d1d5db', width:'100%', marginBottom:8, fontFamily:'"Noto Sans JP",sans-serif' }}
                  >
                    <option value="">コンテンツを選択...</option>
                    {allContents.map(c => (
                      <option key={c.id} value={c.id}>{c.content_name}</option>
                    ))}
                  </select>
                )}
                <button onClick={addContent} disabled={!addCatchAll && !addId} style={{ ...btn('#16a34a', !addCatchAll && !addId), width:'100%' }}>
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
