/**
 * 棚データ投入バッチ
 * 元ファイル: 2603立川北口_マップとリスト_ver7.xlsm の List_full シート
 * 使い方: npx tsx scripts/import-shelves.ts <xlsmファイルパス> <store_id>
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
    console.error('使い方: npx tsx scripts/import-shelves.ts <xlsmファイルパス> <store_id>')
    process.exit(1)
  }

  console.log(`読み込み中: ${xlsxPath}`)
  const wb = XLSX.readFile(xlsxPath, { bookVBA: false })

  // List_full（店舗名付き）または List_full を探す
  const sheetName = wb.SheetNames.find(n => n.startsWith('List_full')) ?? 'List_full'
  const ws = wb.Sheets[sheetName]
  if (!ws) { console.error(`シート "${sheetName}" が見つかりません`); process.exit(1) }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  console.log(`シート: ${sheetName}  総行数: ${rows.length}`)

  // 既存棚を全削除（洗い替え）
  console.log(`店舗 ${storeId} の既存棚データを削除中...`)
  const { error: delErr } = await supabase.from('shelves').delete().eq('store_id', storeId)
  if (delErr) throw new Error(`削除エラー: ${delErr.message}`)

  const records: Record<string, unknown>[] = []
  let skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as (string | number)[]
    const shelfNo = r[0]
    if (!shelfNo || typeof shelfNo !== 'number') { skipped++; continue }

    records.push({
      store_id:       storeId,
      shelf_no:       shelfNo,
      y:              typeof r[1] === 'number' ? r[1] : null,  // Y軸(Col)
      x:              typeof r[2] === 'number' ? r[2] : null,  // X軸(Row)
      shelf_category: String(r[5] || '').trim() || null,       // 分類略称
      genre_code:     String(r[6] || '').trim() || null,       // 分類コード
    })
  }

  console.log(`投入対象: ${records.length}件 / スキップ: ${skipped}件`)

  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase.from('shelves').insert(batch)
    if (error) throw new Error(`INSERT エラー (offset ${i}): ${error.message}`)
    inserted += batch.length
    process.stdout.write(`\r進捗: ${inserted}/${records.length}件`)
  }

  console.log(`\n完了: ${inserted}件 を投入しました`)
}

main().catch(err => { console.error(err); process.exit(1) })
