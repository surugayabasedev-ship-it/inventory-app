/**
 * コンテンツマスタ投入バッチ
 * 元ファイル: 取扱い可否判定シート.xlsx のコンテンツ一覧シート
 * 使い方: npx tsx scripts/import-contents.ts <xlsxファイルパス> <store_id>
 *
 * 列マッピング:
 *   col0: コンテンツ名 → content_name
 *   col4: 列番号（"取扱外"文字列あり）→ is_active = (値が"取扱外"でない)
 *   col5: 売場エリア名 → area
 *   col7: 棚番 → sort_order（参考値）
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

async function main() {
  const [,, xlsxPath, storeId] = process.argv
  if (!xlsxPath || !storeId) {
    console.error('使い方: npx tsx scripts/import-contents.ts <xlsxファイルパス> <store_id>')
    process.exit(1)
  }

  console.log(`読み込み中: ${xlsxPath}`)
  const wb = XLSX.readFile(xlsxPath)
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  console.log(`シート: ${sheetName}  総行数: ${rows.length}`)

  // 既存コンテンツを全削除（洗い替え）
  console.log(`店舗 ${storeId} の既存コンテンツを削除中...`)
  const { error: delErr } = await supabase.from('contents').delete().eq('store_id', storeId)
  if (delErr) throw new Error(`削除エラー: ${delErr.message}`)

  const records: Record<string, unknown>[] = []
  let skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as (string | number)[]
    const contentName = String(r[0] || '').trim()
    if (!contentName) { skipped++; continue }

    const statusFlag = String(r[4] || '').trim()  // "取扱外" or ""
    const area       = String(r[5] || '').trim()
    const sortOrder  = typeof r[7] === 'number' ? r[7] : null

    records.push({
      store_id:     storeId,
      content_name: contentName,
      area:         area || null,
      is_active:    statusFlag !== '取扱外',
      sort_order:   sortOrder,
    })
  }

  // コンテンツ名の重複を除去（同名は最初の1件のみ）
  const seen = new Set<string>()
  const deduped = records.filter(r => {
    const key = `${r.content_name}|${r.area}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  console.log(`投入対象: ${deduped.length}件（重複除去後）/ スキップ: ${skipped}件`)

  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH)
    const { error } = await supabase.from('contents').insert(batch)
    if (error) throw new Error(`INSERT エラー (offset ${i}): ${error.message}`)
    inserted += batch.length
    process.stdout.write(`\r進捗: ${inserted}/${deduped.length}件`)
  }

  console.log(`\n完了: ${inserted}件 を投入しました`)
}

main().catch(err => { console.error(err); process.exit(1) })
