/**
 * コンテンツ一覧.xlsx を元に is_active を同期するスクリプト
 * - Excel に載っているコンテンツ → is_active=true
 * - DB にあるが Excel にないコンテンツ → is_active=false
 * - Excel にあるが DB にないコンテンツ → INSERT (is_active=true)
 *
 * 使い方:
 *   npx tsx scripts/sync-active-from-excel.ts <xlsxファイルパス> <store_id>
 */
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

function toArea(category: string): string {
  if (!category) return 'キャラクターグッズ'
  const c = category.trim()
  if (c.includes('ﾌｨｷﾞｭｱ') || c.includes('フィギュア')) return 'フィギュア'
  if (c.includes('ﾌﾟﾗﾓ') || c.includes('プラモ')) return 'プラモ'
  if (c.includes('ﾄﾚｶ') || c.includes('トレカ')) return 'トレカ'
  if (c.includes('ｹﾞｰﾑ') || c.includes('ゲーム')) return 'ゲーム'
  if (c.includes('鉄道') || c.includes('ﾐﾆｶｰ') || c.includes('ミニカー')) return '鉄道/ミニカー/トイ'
  if (c.includes('ﾇｲｸﾞﾙﾐ') || c.includes('ぬいぐるみ')) return 'ぬいぐるみ'
  return 'キャラクターグッズ'
}

async function main() {
  const [,, xlsxPath, storeId] = process.argv
  if (!xlsxPath || !storeId) {
    console.error('使い方: npx tsx scripts/sync-active-from-excel.ts <xlsxファイルパス> <store_id>')
    process.exit(1)
  }

  // Excel 読み込み
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets['コンテンツ一覧'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as (string | number | null)[][]

  // Excel のコンテンツ名セットを構築（content_name__area をキー）
  const excelKeys = new Set<string>()
  const excelRows: { name: string; area: string }[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const name = row[1] != null ? String(row[1]).trim() : ''
    if (!name) continue
    const category = row[2] != null ? String(row[2]).trim() : ''
    const area = toArea(category)
    const key = `${name}__${area}`
    if (!excelKeys.has(key)) {
      excelKeys.add(key)
      excelRows.push({ name, area })
    }
  }
  console.log(`Excel コンテンツ数: ${excelRows.length}`)

  // DB の既存コンテンツを取得
  const { data: dbContents, error } = await supabase
    .from('contents')
    .select('id, content_name, area, is_active')
    .eq('store_id', storeId)
  if (error) throw new Error(`取得エラー: ${error.message}`)
  console.log(`DB コンテンツ数: ${dbContents?.length ?? 0}`)

  const dbMap = new Map<string, { id: string; is_active: boolean }>()
  for (const c of dbContents ?? []) {
    dbMap.set(`${c.content_name}__${c.area ?? ''}`, { id: c.id, is_active: c.is_active })
  }

  // 1. Excel にある → is_active=true に更新
  const toActivate: string[] = []
  for (const key of excelKeys) {
    const existing = dbMap.get(key)
    if (existing && !existing.is_active) toActivate.push(existing.id)
  }
  if (toActivate.length > 0) {
    const { error } = await supabase.from('contents').update({ is_active: true, updated_at: new Date().toISOString() }).in('id', toActivate)
    if (error) throw new Error(`activate エラー: ${error.message}`)
    console.log(`✓ 取扱中に更新: ${toActivate.length}件`)
  } else {
    console.log('✓ 取扱中に更新: 0件')
  }

  // 2. DB にあるが Excel にない → is_active=false に更新
  const toDeactivate: string[] = []
  for (const [key, val] of dbMap.entries()) {
    if (!excelKeys.has(key) && val.is_active) toDeactivate.push(val.id)
  }
  if (toDeactivate.length > 0) {
    const BATCH = 100
    for (let i = 0; i < toDeactivate.length; i += BATCH) {
      const { error } = await supabase.from('contents').update({ is_active: false, updated_at: new Date().toISOString() }).in('id', toDeactivate.slice(i, i + BATCH))
      if (error) throw new Error(`deactivate エラー: ${error.message}`)
    }
    console.log(`✓ 取扱外に更新: ${toDeactivate.length}件`)
  } else {
    console.log('✓ 取扱外に更新: 0件')
  }

  // 3. Excel にあるが DB にない → INSERT
  const toInsert: { store_id: string; content_name: string; area: string; is_active: boolean; sort_order: number }[] = []
  for (let i = 0; i < excelRows.length; i++) {
    const { name, area } = excelRows[i]
    const key = `${name}__${area}`
    if (!dbMap.has(key)) {
      toInsert.push({ store_id: storeId, content_name: name, area, is_active: true, sort_order: i })
    }
  }
  if (toInsert.length > 0) {
    const BATCH = 200
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const { error } = await supabase.from('contents').insert(toInsert.slice(i, i + BATCH))
      if (error) throw new Error(`INSERT エラー: ${error.message}`)
    }
    console.log(`✓ 新規追加: ${toInsert.length}件`)
  } else {
    console.log('✓ 新規追加: 0件')
  }

  console.log('完了！')
}

main().catch(err => { console.error(err); process.exit(1) })
