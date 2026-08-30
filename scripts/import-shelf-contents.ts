/**
 * 棚-コンテンツ紐付け投入バッチ
 * 元ファイル: コンテンツ棚割イメージ.xlsx の list シート
 * 使い方: npx tsx scripts/import-shelf-contents.ts <xlsxファイルパス> <store_id>
 *
 * 列マッピング:
 *   col0: 棚番号 → shelves.shelf_no で引いて shelf_id
 *   col6~: 所属コンテンツ（複数列）→ shelf_contents に1行ずつ
 *          "その他" "50音" を含む場合 is_catch_all=true
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

const CATCH_ALL_KEYWORDS = ['その他', '50音', 'その他ﾌｧﾝｼｰ', '他ファンシー', '他ﾌｧﾝｼｰ']

function isCatchAll(name: string): boolean {
  return CATCH_ALL_KEYWORDS.some(kw => name.includes(kw))
}

async function main() {
  const [,, xlsxPath, storeId] = process.argv
  if (!xlsxPath || !storeId) {
    console.error('使い方: npx tsx scripts/import-shelf-contents.ts <xlsxファイルパス> <store_id>')
    process.exit(1)
  }

  console.log(`読み込み中: ${xlsxPath}`)
  const wb = XLSX.readFile(xlsxPath)
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  console.log(`シート: ${sheetName}  総行数: ${rows.length}`)

  // shelves を store_id でまとめて取得（shelf_no → id のマップ）
  const { data: shelvesList, error: shelvesErr } = await supabase
    .from('shelves')
    .select('shelf_id, shelf_no')
    .eq('store_id', storeId)
  if (shelvesErr) throw new Error(`shelves取得エラー: ${shelvesErr.message}`)
  const shelfMap = new Map<number, string>()
  for (const s of shelvesList ?? []) shelfMap.set(s.shelf_no, s.shelf_id)

  // contents を store_id でまとめて取得（content_name → id のマップ）
  const { data: contentsList, error: contentsErr } = await supabase
    .from('contents')
    .select('id, content_name')
    .eq('store_id', storeId)
  if (contentsErr) throw new Error(`contents取得エラー: ${contentsErr.message}`)
  const contentMap = new Map<string, string>()
  for (const c of contentsList ?? []) contentMap.set(c.content_name, c.id)

  // 既存の shelf_contents を削除（100件ずつバッチ処理）
  console.log('既存の棚-コンテンツ紐付けを削除中...')
  const shelfIds = [...shelfMap.values()]
  const DEL_BATCH = 100
  for (let i = 0; i < shelfIds.length; i += DEL_BATCH) {
    const chunk = shelfIds.slice(i, i + DEL_BATCH)
    const { error: delErr } = await supabase
      .from('shelf_contents')
      .delete()
      .in('shelf_id', chunk)
    if (delErr) throw new Error(`削除エラー: ${delErr.message}`)
  }

  const records: Record<string, unknown>[] = []
  let skippedShelf = 0
  let skippedContent = 0

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as (string | number)[]
    const shelfNo = typeof r[0] === 'number' ? r[0] : parseInt(String(r[0]))
    if (!shelfNo || isNaN(shelfNo)) { skippedShelf++; continue }

    const shelfId = shelfMap.get(shelfNo)
    if (!shelfId) { skippedShelf++; continue }

    // col6以降がコンテンツ名（空になるまで）
    const contentCols = (r as (string | number)[]).slice(6).map(v => String(v || '').trim()).filter(Boolean)

    for (let order = 0; order < contentCols.length; order++) {
      const name = contentCols[order]
      const catchAll = isCatchAll(name)
      const contentId = contentMap.get(name) ?? null

      if (!contentId && !catchAll) {
        // contentsテーブルに存在しないコンテンツ名（ログのみ）
        skippedContent++
      }

      records.push({
        shelf_id:      shelfId,
        content_id:    contentId,
        is_catch_all:  catchAll,
        display_order: order,
      })
    }
  }

  console.log(`投入対象: ${records.length}件 / 棚スキップ: ${skippedShelf}件 / コンテンツ未マッチ: ${skippedContent}件`)

  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase.from('shelf_contents').insert(batch)
    if (error) throw new Error(`INSERT エラー (offset ${i}): ${error.message}`)
    inserted += batch.length
    process.stdout.write(`\r進捗: ${inserted}/${records.length}件`)
  }

  console.log(`\n完了: ${inserted}件 を投入しました`)
}

main().catch(err => { console.error(err); process.exit(1) })
