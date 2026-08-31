import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { utils as XLSXUtils, read as XLSXRead, writeFile as XLSXWriteFile } from 'xlsx'
import { AdminLayout } from './AdminLayout'

interface Content {
  id: string
  content_name: string
  area: string | null
  is_active: boolean
  sort_order: number | null
}

const AREA_TABS = ['すべて', 'キャラクターグッズ', 'フィギュア', 'プラモ', 'トレカ', 'ゲーム', '鉄道/ミニカー/トイ', 'ぬいぐるみ', 'その他・未設定']
const AREA_OPTIONS = AREA_TABS.slice(1, -1)
const MAIN_TABS = ['コンテンツ一覧', '新規候補', '新規追加'] as const
type MainTab = typeof MAIN_TABS[number]
type StatusFilter = 'すべて' | '取扱中' | '取扱外'
type SortKey = 'content_name' | 'area' | 'is_active'
type SortDir = 'asc' | 'desc'

// 50音グループ（頭文字バー用）
const KANA_GROUPS: { label: string; chars: string[] }[] = [
  { label: 'あ', chars: ['あ','い','う','え','お','ア','イ','ウ','エ','オ'] },
  { label: 'か', chars: ['か','き','く','け','こ','カ','キ','ク','ケ','コ','が','ぎ','ぐ','げ','ご','ガ','ギ','グ','ゲ','ゴ'] },
  { label: 'さ', chars: ['さ','し','す','せ','そ','サ','シ','ス','セ','ソ','ざ','じ','ず','ぜ','ぞ','ザ','ジ','ズ','ゼ','ゾ'] },
  { label: 'た', chars: ['た','ち','つ','て','と','タ','チ','ツ','テ','ト','だ','ぢ','づ','で','ど','ダ','ヂ','ヅ','デ','ド'] },
  { label: 'な', chars: ['な','に','ぬ','ね','の','ナ','ニ','ヌ','ネ','ノ'] },
  { label: 'は', chars: ['は','ひ','ふ','へ','ほ','ハ','ヒ','フ','ヘ','ホ','ば','び','ぶ','べ','ぼ','バ','ビ','ブ','ベ','ボ','ぱ','ぴ','ぷ','ぺ','ぽ','パ','ピ','プ','ペ','ポ'] },
  { label: 'ま', chars: ['ま','み','む','め','も','マ','ミ','ム','メ','モ'] },
  { label: 'や', chars: ['や','ゆ','よ','ヤ','ユ','ヨ'] },
  { label: 'ら', chars: ['ら','り','る','れ','ろ','ラ','リ','ル','レ','ロ'] },
  { label: 'わ', chars: ['わ','を','ん','ワ','ヲ','ン'] },
]
const ALPHA_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function matchesInitial(name: string, initial: string): boolean {
  if (!initial || initial === 'すべて') return true
  const first = name[0] ?? ''
  if (initial === '#') return /[0-9０-９]/.test(first)
  if (ALPHA_LABELS.includes(initial)) return first.toUpperCase() === initial
  const group = KANA_GROUPS.find(g => g.label === initial)
  if (group) return group.chars.includes(first)
  return false
}

interface Props {
  storeId: string
  storeName: string
  storeCode: string
}

export function ContentsAdmin({ storeId, storeName, storeCode }: Props) {
  const [contents, setContents] = useState<Content[]>([])
  const [newCandidates, setNewCandidates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [mainTab, setMainTab] = useState<MainTab>('コンテンツ一覧')
  const [areaTab, setAreaTab] = useState('すべて')
  const [nameFilter, setNameFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('すべて')
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [editMode, setEditMode] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('content_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [initialFilter, setInitialFilter] = useState('')
  const [newName, setNewName] = useState('')
  const [newArea, setNewArea] = useState('')
  const [newIsActive, setNewIsActive] = useState<boolean | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [storeId])
  useEffect(() => {
    if (mainTab === '新規候補' && newCandidates.length === 0) loadCandidates()
  }, [mainTab])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('contents')
      .select('id, content_name, area, is_active, sort_order')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('content_name', { ascending: true })
    setContents(data ?? [])
    setLoading(false)
  }

  async function loadCandidates() {
    setCandidatesLoading(true)
    // inventoryにあってcontentsマスタにないcontent_name
    const { data: invData } = await supabase
      .from('inventory')
      .select('content_name')
      .eq('store_id', storeId)
      .not('content_name', 'is', null)
    const masterNames = new Set(contents.map(c => c.content_name))
    const candidates = [...new Set((invData ?? []).map(r => r.content_name as string))]
      .filter(name => name && !masterNames.has(name))
      .sort()
    setNewCandidates(candidates)
    setCandidatesLoading(false)
  }

  async function toggleActive(c: Content) {
    setSaving(prev => new Set(prev).add(c.id))
    await supabase.from('contents').update({ is_active: !c.is_active, updated_at: new Date().toISOString() }).eq('id', c.id)
    setContents(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !c.is_active } : x))
    setSaving(prev => { const s = new Set(prev); s.delete(c.id); return s })
  }

  async function deleteContent(c: Content) {
    if (!confirm(`「${c.content_name}」をマスターから完全削除しますか？\n棚割の紐付けも削除されます。\n（「取扱外」設定とは異なります）`)) return
    await supabase.from('shelf_contents').delete().eq('content_id', c.id)
    await supabase.from('contents').delete().eq('id', c.id)
    setContents(prev => prev.filter(x => x.id !== c.id))
  }

  async function addContent(name?: string) {
    const targetName = (name ?? newName).trim()
    if (!targetName) return
    const { data } = await supabase.from('contents').insert({
      store_id: storeId,
      content_name: targetName,
      area: newArea.trim() || null,
      is_active: newIsActive ?? true,
    }).select('id, content_name, area, is_active, sort_order').single()
    if (data) {
      setContents(prev => [...prev, data])
      setNewCandidates(prev => prev.filter(n => n !== targetName))
    }
    if (!name) { setNewName(''); setNewArea(''); setNewIsActive(null) }
  }

  function exportXlsx() {
    const rows = filtered.map(c => ({
      コンテンツ名: c.content_name,
      エリア: c.area ?? '',
      取扱状態: c.is_active ? '取扱中' : '取扱外',
    }))
    const ws = XLSXUtils.json_to_sheet(rows)
    const wb = XLSXUtils.book_new()
    XLSXUtils.book_append_sheet(wb, ws, 'コンテンツ一覧')
    XLSXWriteFile(wb, `コンテンツ一覧_${storeName}.xlsx`)
  }

  async function importXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const buf = await file.arrayBuffer()
    const wb = XLSXRead(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: { コンテンツ名?: string; エリア?: string; 取扱状態?: string }[] = XLSXUtils.sheet_to_json(ws)
    let updated = 0
    for (const row of rows) {
      const name = String(row['コンテンツ名'] ?? '').trim()
      if (!name) continue
      const isActive = String(row['取扱状態'] ?? '').trim() !== '取扱外'
      const area = String(row['エリア'] ?? '').trim() || null
      const existing = contents.find(c => c.content_name === name)
      if (existing) {
        await supabase.from('contents').update({ is_active: isActive, area, updated_at: new Date().toISOString() }).eq('id', existing.id)
        updated++
      }
    }
    alert(`${updated}件を更新しました`)
    load()
    if (fileRef.current) fileRef.current.value = ''
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // ステータスフィルタを除いた基底フィルタ（カウント表示用）
  const baseFiltered = contents.filter(c => {
    if (nameFilter && !c.content_name.toLowerCase().includes(nameFilter.toLowerCase())) return false
    if (initialFilter && !matchesInitial(c.content_name, initialFilter)) return false
    if (areaTab === 'すべて') return true
    if (areaTab === 'その他・未設定') return !c.area || !AREA_OPTIONS.includes(c.area)
    return c.area === areaTab
  })

  const filtered = baseFiltered
    .filter(c => {
      if (statusFilter === '取扱中' && !c.is_active) return false
      if (statusFilter === '取扱外' && c.is_active) return false
      return true
    })
    .sort((a, b) => {
      let av: string, bv: string
      if (sortKey === 'content_name') { av = a.content_name; bv = b.content_name }
      else if (sortKey === 'area') { av = a.area ?? ''; bv = b.area ?? '' }
      else { av = a.is_active ? '0' : '1'; bv = b.is_active ? '0' : '1' }
      const cmp = av.localeCompare(bv, 'ja')
      return sortDir === 'asc' ? cmp : -cmp
    })

  const activeCount = baseFiltered.filter(c => c.is_active).length
  const inactiveCount = baseFiltered.filter(c => !c.is_active).length

  return (
    <AdminLayout storeName={storeName} storeCode={storeCode} currentPage="contents">
    <div style={{ minHeight: '100%', fontFamily: '"Noto Sans JP", sans-serif' }}>

      {/* ページヘッダー */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>コンテンツ管理</span>
        {mainTab === 'コンテンツ一覧' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={() => setEditMode(v => !v)}
              style={btnStyle(editMode ? '#fef3c7' : '#f1f5f9', editMode ? '#92400e' : '#475569')}
            >
              {editMode ? '編集中（完了）' : '削除モード'}
            </button>
            <button onClick={exportXlsx} style={btnStyle('#64748b', '#fff')}>Excel出力</button>
            <label style={{ ...btnStyle('#2563eb', '#fff'), cursor: 'pointer' }}>
              Excelインポート
              <input ref={fileRef} type="file" accept=".xlsx" onChange={importXlsx} style={{ display: 'none' }} />
            </label>
          </div>
        )}
      </div>

      {/* メインタブ */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '2px solid #e2e8f0' }}>
        {MAIN_TABS.map(t => (
          <button key={t} onClick={() => setMainTab(t)} style={{
            padding: '12px 20px', border: 'none', whiteSpace: 'nowrap',
            borderBottom: mainTab === t ? '3px solid #2563eb' : '3px solid transparent',
            background: 'none', color: mainTab === t ? '#2563eb' : '#64748b',
            fontWeight: mainTab === t ? 700 : 400, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {t}
            {t === '新規候補' && newCandidates.length > 0 && (
              <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 11, padding: '1px 6px' }}>
                {newCandidates.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── コンテンツ一覧 ─── */}
      {mainTab === 'コンテンツ一覧' && (
        <>
          {/* エリアタブ */}
          <div style={{ display: 'flex', background: '#f8f9fa', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', paddingLeft: 8 }}>
            {AREA_TABS.map(a => (
              <button key={a} onClick={() => setAreaTab(a)} style={{
                padding: '10px 14px', border: 'none', whiteSpace: 'nowrap',
                borderBottom: areaTab === a ? '2px solid #1a2c6e' : '2px solid transparent',
                background: 'none', color: areaTab === a ? '#1a2c6e' : '#94a3b8',
                fontWeight: areaTab === a ? 700 : 400, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>{a}</button>
            ))}
          </div>

          <div style={{ padding: '16px 24px' }}>
            {/* 検索 + フィルター */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                value={nameFilter}
                onChange={e => setNameFilter(e.target.value)}
                placeholder="コンテンツ名で検索..."
                style={{ padding: '8px 14px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: 14, width: 220, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                {(['すべて', '取扱中', '取扱外'] as StatusFilter[]).map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)} style={{
                    padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                    background: statusFilter === s ? '#1e293b' : '#e2e8f0',
                    color: statusFilter === s ? '#fff' : '#64748b',
                    fontWeight: statusFilter === s ? 700 : 400,
                  }}>{s}</button>
                ))}
              </div>
              <span style={{ fontSize: 13, color: '#64748b', marginLeft: 4 }}>
                取扱中: <b style={{ color: '#16a34a' }}>{activeCount}</b> / 取扱外: <b style={{ color: '#dc2626' }}>{inactiveCount}</b>
              </span>
            </div>

            {/* 頭文字バー */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 14, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 4, whiteSpace: 'nowrap' }}>頭文字:</span>
              {[{ label: 'すべて', chars: [] as string[] }, ...KANA_GROUPS].map(g => (
                <button key={g.label} onClick={() => setInitialFilter(g.label === 'すべて' ? '' : g.label)} style={{
                  padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                  background: initialFilter === (g.label === 'すべて' ? '' : g.label) ? '#1a2c6e' : '#e2e8f0',
                  color: initialFilter === (g.label === 'すべて' ? '' : g.label) ? '#fff' : '#475569',
                  fontWeight: 600,
                }}>{g.label}</button>
              ))}
              <span style={{ width: 8 }} />
              {ALPHA_LABELS.map(a => (
                <button key={a} onClick={() => setInitialFilter(initialFilter === a ? '' : a)} style={{
                  padding: '3px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
                  background: initialFilter === a ? '#1a2c6e' : '#f1f5f9',
                  color: initialFilter === a ? '#fff' : '#64748b',
                }}>{a}</button>
              ))}
              <button onClick={() => setInitialFilter(initialFilter === '#' ? '' : '#')} style={{
                padding: '3px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
                background: initialFilter === '#' ? '#1a2c6e' : '#f1f5f9',
                color: initialFilter === '#' ? '#fff' : '#64748b',
              }}>#</button>
            </div>

            {/* テーブル */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>読み込み中...</div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      {(['content_name', 'area', 'is_active'] as SortKey[]).map((key, i) => (
                        <th key={key} onClick={() => toggleSort(key)} style={{
                          ...th, cursor: 'pointer', userSelect: 'none',
                          width: key === 'is_active' ? 110 : undefined,
                        }}>
                          {['コンテンツ名', 'エリア', '取扱状態'][i]}
                          {' '}{sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : <span style={{ color: '#cbd5e1' }}>↕</span>}
                        </th>
                      ))}
                      {editMode && <th style={{ ...th, width: 60 }}>削除</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => (
                      <tr key={c.id} style={{ borderTop: '1px solid #e2e8f0', opacity: c.is_active ? 1 : 0.55 }}>
                        <td style={td}>{c.content_name}</td>
                        <td style={{ ...td, color: '#64748b' }}>
                          {c.area ?? <span style={{ color: '#cbd5e1' }}>未設定</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <button
                            onClick={() => toggleActive(c)}
                            disabled={saving.has(c.id)}
                            style={{
                              padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                              background: c.is_active ? '#dcfce7' : '#fee2e2',
                              color: c.is_active ? '#16a34a' : '#dc2626',
                              fontWeight: 700, fontSize: 12, fontFamily: 'inherit',
                              opacity: saving.has(c.id) ? 0.5 : 1,
                            }}
                          >
                            {c.is_active ? '取扱中' : '取扱外'}
                          </button>
                        </td>
                        {editMode && (
                          <td style={{ ...td, textAlign: 'center' }}>
                            <button
                              onClick={() => deleteContent(c)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
                              title="マスターから完全削除"
                            >✕</button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={editMode ? 4 : 3} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>該当なし</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── 新規候補 ─── */}
      {mainTab === '新規候補' && (
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            在庫データに存在するが、コンテンツマスタに未登録のコンテンツです。取扱可否を確認してマスタに追加してください。
          </p>
          {candidatesLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>読み込み中...</div>
          ) : newCandidates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>未登録コンテンツはありません</div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={th}>コンテンツ名</th>
                    <th style={{ ...th, width: 180 }}>エリア</th>
                    <th style={{ ...th, width: 160 }}>取扱状態</th>
                    <th style={{ ...th, width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {newCandidates.map(name => (
                    <CandidateRow key={name} name={name} areaOptions={AREA_OPTIONS} onAdd={(area, isActive) => {
                      setNewArea(area); setNewIsActive(isActive)
                      supabase.from('contents').insert({
                        store_id: storeId, content_name: name,
                        area: area || null, is_active: isActive,
                      }).select('id, content_name, area, is_active, sort_order').single().then(({ data }) => {
                        if (data) {
                          setContents(prev => [...prev, data])
                          setNewCandidates(prev => prev.filter(n => n !== name))
                        }
                      })
                    }} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── 新規追加 ─── */}
      {mainTab === '新規追加' && (
        <div style={{ padding: '20px 24px', maxWidth: 480 }}>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            コンテンツマスタに新しいコンテンツを追加します。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#fff', padding: 24, borderRadius: 12, border: '1.5px solid #e2e8f0' }}>
            <label style={labelStyle}>
              コンテンツ名 <span style={{ color: '#ef4444' }}>*</span>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="例: ワンピース"
                style={inputStyle}
                onKeyDown={e => e.key === 'Enter' && addContent()}
              />
            </label>
            <label style={labelStyle}>
              エリア
              <select value={newArea} onChange={e => setNewArea(e.target.value)} style={inputStyle}>
                <option value="">未設定</option>
                {AREA_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              取扱状態
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {[true, false].map(v => (
                  <button key={String(v)} onClick={() => setNewIsActive(v)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, border: '1.5px solid',
                    borderColor: newIsActive === v ? (v ? '#16a34a' : '#dc2626') : '#e2e8f0',
                    background: newIsActive === v ? (v ? '#dcfce7' : '#fee2e2') : '#fff',
                    color: newIsActive === v ? (v ? '#16a34a' : '#dc2626') : '#94a3b8',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {v ? '取扱中' : '取扱外'}
                  </button>
                ))}
              </div>
            </label>
            <button
              onClick={() => addContent()}
              disabled={!newName.trim()}
              style={{ ...btnStyle('#2563eb', '#fff'), padding: '12px 0', opacity: newName.trim() ? 1 : 0.4 }}
            >
              マスタに追加
            </button>
          </div>
        </div>
      )}
    </div>
    </AdminLayout>
  )
}

function CandidateRow({ name, areaOptions, onAdd }: {
  name: string
  areaOptions: string[]
  onAdd: (area: string, isActive: boolean) => void
}) {
  const [area, setArea] = useState('')
  const [isActive, setIsActive] = useState<boolean | null>(null)
  const [added, setAdded] = useState(false)

  if (added) return null
  return (
    <tr style={{ borderTop: '1px solid #e2e8f0' }}>
      <td style={td}>{name}</td>
      <td style={td}>
        <select value={area} onChange={e => setArea(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
          <option value="">未設定</option>
          {areaOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </td>
      <td style={td}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[true, false].map(v => (
            <button key={String(v)} onClick={() => setIsActive(v)} style={{
              padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
              background: isActive === v ? (v ? '#dcfce7' : '#fee2e2') : '#f1f5f9',
              color: isActive === v ? (v ? '#16a34a' : '#dc2626') : '#94a3b8',
              fontWeight: isActive === v ? 700 : 400,
            }}>{v ? '取扱中' : '取扱外'}</button>
          ))}
        </div>
      </td>
      <td style={td}>
        <button
          onClick={() => { if (isActive !== null) { onAdd(area, isActive); setAdded(true) } }}
          disabled={isActive === null}
          style={{ ...btnStyle('#2563eb', '#fff'), padding: '5px 12px', opacity: isActive !== null ? 1 : 0.3 }}
        >
          追加
        </button>
      </td>
    </tr>
  )
}

const th: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontWeight: 700,
  fontSize: 13, color: '#475569', borderRight: '1px solid #e2e8f0',
}
const td: React.CSSProperties = {
  padding: '10px 16px', borderRight: '1px solid #e2e8f0',
}
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
  fontSize: 13, fontWeight: 600, color: '#374151',
}
const inputStyle: React.CSSProperties = {
  padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, fontFamily: '"Noto Sans JP", sans-serif', width: '100%', boxSizing: 'border-box',
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '7px 16px', background: bg, color, border: 'none',
    borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  }
}
