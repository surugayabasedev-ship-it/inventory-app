/**
 * モディ店 コンテンツ・棚コンテンツ投入バッチ
 * 元ファイル: コンテンツ一覧.xlsx
 *
 * 列マッピング（0オリジン）:
 *   col0 (A): No
 *   col1 (B): コンテンツ名
 *   col2 (C): 分類 → エリア変換
 *   col5 (F): 棚番号（カンマ区切り複数可）→ shelf_contents
 *
 * エリア変換ルール:
 *   ﾌｨｷﾞｭｱ        → フィギュア
 *   ﾌﾟﾗﾓ           → プラモ
 *   ﾄﾚｶ            → トレカ
 *   ｹﾞｰﾑ           → ゲーム
 *   鉄道/ﾐﾆｶｰ/ﾄｲ   → 鉄道/ミニカー
 *   ﾇｲｸﾞﾙﾐ         → ぬいぐるみ
 *   それ以外        → キャラクターグッズ
 *
 * 実行手順:
 *   1. import-modi-shelves.ts を先に実行（棚がDBにないとshelf_contentsが作れない）
 *   2. npx tsx scripts/import-modi-contents.ts <xlsxファイルパス> <store_id>
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

/** "1234" "1234,5678" "1234・5678" などを数値配列に変換 */
function parseShelfNos(raw: unknown): number[] {
  if (raw === null || raw === undefined) return []
  const str = String(raw).replace(/[・/／、\s]/g, ',')
  return str
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n > 0)
}

async function main() {
  const [,, xlsxPath, storeId] = process.argv
  if (!xlsxPath || !storeId) {
    console.error('使い方: npx tsx scripts/import-modi-contents.ts <xlsxファイルパス> <store_id>')
    process.exit(1)
  }

  console.log(`読み込み中: ${xlsxPath}`)
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets['コンテンツ一覧'] ?? wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]

  // ヘッダー行をスキップして有効行だけ収集
  const contentRows: { name: string; area: string; shelfNos: number[] }[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[]
    const name = row[1] !== null && row[1] !== undefined ? String(row[1]).trim() : ''
    if (!name) continue
    const category = row[2] !== null && row[2] !== undefined ? String(row[2]).trim() : ''
    const shelfNos = parseShelfNos(row[5])
    contentRows.push({ name, area: toArea(category), shelfNos })
  }
  console.log(`コンテンツ行数: ${contentRows.length}`)

  // 棚番号→shelf_idのマップを構築
  console.log('棚データ取得中...')
  const { data: shelves, error: shelvesErr } = await supabase
    .from('shelves')
    .select('shelf_id, shelf_no')
    .eq('store_id', storeId)
  if (shelvesErr) throw new Error(`棚取得エラー: ${shelvesErr.message}`)
  const shelfNoToId = new Map<number, string>()
  for (const s of shelves ?? []) shelfNoToId.set(s.shelf_no, s.shelf_id)
  console.log(`棚 ${shelfNoToId.size}件 取得`)

  // 既存コンテンツの is_active を保存してから削除
  console.log('既存コンテンツデータ取得中...')
  const { data: existingContents } = await supabase
    .from('contents')
    .select('id, content_name, area, is_active')
    .eq('store_id', storeId)
  const existingContentIds = (existingContents ?? []).map(c => c.id)

  // content_name__area → is_active のマップ（再インポート時に取扱外設定を保持）
  const existingActiveMap = new Map<string, boolean>()
  for (const c of existingContents ?? []) {
    existingActiveMap.set(`${c.content_name}__${c.area ?? ''}`, c.is_active)
  }

  const DEL_BATCH = 100
  for (let i = 0; i < existingContentIds.length; i += DEL_BATCH) {
    await supabase.from('shelf_contents').delete().in('content_id', existingContentIds.slice(i, i + DEL_BATCH))
  }
  await supabase.from('contents').delete().eq('store_id', storeId)
  console.log(`既存コンテンツ ${existingContentIds.length}件 削除完了`)

  // contentsをINSERT（既存の is_active を引き継ぎ、新規は true）
  const INS_BATCH = 200
  let insertedContents = 0
  const contentRecords = contentRows.map((cr, i) => ({
    store_id: storeId,
    content_name: cr.name,
    area: cr.area,
    is_active: existingActiveMap.get(`${cr.name}__${cr.area}`) ?? true,
    sort_order: i,
  }))

  // キー: "content_name__area" で同名・異分類コンテンツを区別する
  const contentIdByKey = new Map<string, string>()
  for (let i = 0; i < contentRecords.length; i += INS_BATCH) {
    const batch = contentRecords.slice(i, i + INS_BATCH)
    const { data, error } = await supabase.from('contents').insert(batch).select('id, content_name, area')
    if (error) throw new Error(`contents INSERT エラー: ${error.message}`)
    for (const row of data ?? []) contentIdByKey.set(`${row.content_name}__${row.area ?? ''}`, row.id)
    insertedContents += batch.length
    process.stdout.write(`\rコンテンツ: ${insertedContents}/${contentRecords.length}`)
  }
  console.log(`\nコンテンツ投入完了: ${insertedContents}件`)

  // shelf_contentsをINSERT
  const scRecords: {
    shelf_id: string
    content_id: string
    is_catch_all: boolean
    display_order: number
  }[] = []

  let unmatchedShelves = 0
  for (const cr of contentRows) {
    const contentId = contentIdByKey.get(`${cr.name}__${cr.area}`)
    if (!contentId) continue
    for (const shelfNo of cr.shelfNos) {
      const shelfId = shelfNoToId.get(shelfNo)
      if (!shelfId) { unmatchedShelves++; continue }
      scRecords.push({
        shelf_id: shelfId,
        content_id: contentId,
        is_catch_all: isCatchAll(cr.name),
        display_order: 0,
      })
    }
  }

  console.log(`shelf_contents候補: ${scRecords.length}件 | 棚番号未マッチ: ${unmatchedShelves}件`)

  let insertedSc = 0
  for (let i = 0; i < scRecords.length; i += INS_BATCH) {
    const { error } = await supabase.from('shelf_contents').insert(scRecords.slice(i, i + INS_BATCH))
    if (error) throw new Error(`shelf_contents INSERT エラー: ${error.message}`)
    insertedSc += Math.min(INS_BATCH, scRecords.length - i)
    process.stdout.write(`\rshelf_contents: ${insertedSc}/${scRecords.length}`)
  }
  console.log(`\nshelf_contents投入完了: ${insertedSc}件`)
  console.log('完了！')
}

main().catch(err => { console.error(err); process.exit(1) })
