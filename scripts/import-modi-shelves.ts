/**
 * モディ店 棚マスタ投入バッチ
 * 元ファイル: modi map.xlsx (分類Mapシート)
 *
 * マップ形式:
 *   行1    = Y軸（列位置）ヘッダー
 *   列A    = X軸（行位置）ヘッダー
 *   セル値 = 棚番号（数値）
 *
 * 除外ルール:
 *   - 棚番号0 または非数値 → スキップ
 *   - 8000〜8999 → カウンター内棚のためスキップ
 *   - 重複棚番号 → 最初の出現のみ採用
 *
 * 使い方:
 *   npx tsx scripts/import-modi-shelves.ts <xlsxファイルパス> <store_id>
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
    console.error('使い方: npx tsx scripts/import-modi-shelves.ts <xlsxファイルパス> <store_id>')
    process.exit(1)
  }

  console.log(`読み込み中: ${xlsxPath}`)
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets['分類Map'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]

  // 行1のY軸ヘッダーを取得（col index → y座標）
  const headerRow = rows[0] as (number | null)[]
  const colToY = new Map<number, number>()
  for (let c = 1; c < headerRow.length; c++) {
    const v = headerRow[c]
    if (typeof v === 'number') colToY.set(c, v)
  }

  // グリッドを走査して棚データ抽出
  const seen = new Set<number>()
  const records: { store_id: string; shelf_no: number; x: number; y: number }[] = []
  let skipped8000 = 0
  let skippedDup = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as (number | string | null)[]
    const xVal = row[0]
    if (typeof xVal !== 'number') continue
    const x = xVal

    for (let c = 1; c < row.length; c++) {
      const v = row[c]
      if (v === null || v === undefined) continue
      const shelfNo = typeof v === 'number' ? v : parseInt(String(v))
      if (!shelfNo || isNaN(shelfNo) || shelfNo === 0) continue

      // 8000台除外
      if (shelfNo >= 8000 && shelfNo < 9000) { skipped8000++; continue }

      // 重複除外
      if (seen.has(shelfNo)) { skippedDup++; continue }
      seen.add(shelfNo)

      const y = colToY.get(c)
      if (y === undefined) continue

      records.push({ store_id: storeId, shelf_no: shelfNo, x, y })
    }
  }

  console.log(`抽出: ${records.length}棚 | 8000台除外: ${skipped8000} | 重複除外: ${skippedDup}`)

  // 既存 shelf_contents → shelves を削除
  console.log('既存データ削除中...')
  const { data: existingShelves } = await supabase
    .from('shelves')
    .select('shelf_id')
    .eq('store_id', storeId)
  const existingIds = (existingShelves ?? []).map(s => s.shelf_id)

  // shelf_contents を先に削除（FK制約）
  const DEL_BATCH = 100
  for (let i = 0; i < existingIds.length; i += DEL_BATCH) {
    await supabase.from('shelf_contents').delete().in('shelf_id', existingIds.slice(i, i + DEL_BATCH))
  }
  await supabase.from('shelves').delete().eq('store_id', storeId)
  console.log(`既存棚 ${existingIds.length}件 削除完了`)

  // INSERT
  const INS_BATCH = 500
  let inserted = 0
  for (let i = 0; i < records.length; i += INS_BATCH) {
    const { error } = await supabase.from('shelves').insert(records.slice(i, i + INS_BATCH))
    if (error) throw new Error(`INSERT エラー: ${error.message}`)
    inserted += Math.min(INS_BATCH, records.length - i)
    process.stdout.write(`\r進捗: ${inserted}/${records.length}`)
  }
  console.log(`\n完了: ${inserted}棚 投入`)
}

main().catch(err => { console.error(err); process.exit(1) })
