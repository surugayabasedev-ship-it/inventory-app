/**
 * DBとExcelのキー差分を確認するデバッグスクリプト
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

  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets['コンテンツ一覧'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as (string | number | null)[][]

  const excelKeys = new Set<string>()
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const name = row[1] != null ? String(row[1]).trim() : ''
    if (!name) continue
    const category = row[2] != null ? String(row[2]).trim() : ''
    excelKeys.add(`${name}__${toArea(category)}`)
  }

  const { data: dbContents } = await supabase
    .from('contents')
    .select('id, content_name, area, is_active')
    .eq('store_id', storeId)

  const dbMap = new Map<string, { ids: string[]; is_active: boolean }>()
  for (const c of dbContents ?? []) {
    const key = `${c.content_name}__${c.area ?? ''}`
    const existing = dbMap.get(key)
    if (existing) {
      existing.ids.push(c.id)
    } else {
      dbMap.set(key, { ids: [c.id], is_active: c.is_active })
    }
  }

  // 重複チェック
  const duplicates: { key: string; count: number }[] = []
  for (const [key, val] of dbMap.entries()) {
    if (val.ids.length > 1) duplicates.push({ key, count: val.ids.length })
  }
  console.log(`\n=== 重複コンテンツ (${duplicates.length}件) ===`)
  for (const d of duplicates) console.log(`  ${d.key} × ${d.count}`)

  // ExcelにあってDBにない
  const inExcelNotDb: string[] = []
  for (const key of excelKeys) {
    if (!dbMap.has(key)) inExcelNotDb.push(key)
  }
  console.log(`\n=== Excelにあり・DBにない (${inExcelNotDb.length}件) ===`)
  for (const k of inExcelNotDb) console.log(`  ${k}`)

  // DBにあってExcelにない
  const inDbNotExcel: { key: string; is_active: boolean }[] = []
  for (const [key, val] of dbMap.entries()) {
    if (!excelKeys.has(key)) inDbNotExcel.push({ key, is_active: val.is_active })
  }
  console.log(`\n=== DBにあり・Excelにない (${inDbNotExcel.length}件) ===`)
  for (const d of inDbNotExcel) console.log(`  [is_active=${d.is_active}] ${d.key}`)

  // is_active=falseのDB項目
  const falseItems = [...dbMap.entries()].filter(([, v]) => !v.is_active)
  console.log(`\n=== DB内 is_active=false (${falseItems.length}件) ===`)
  for (const [key] of falseItems) console.log(`  ${key}`)
}

main().catch(err => { console.error(err); process.exit(1) })
