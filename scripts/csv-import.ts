/**
 * CSV取込バッチ
 * 使い方: npx tsx scripts/csv-import.ts <csvファイルパス> <store_id>
 *
 * 環境変数（.env.local）:
 *   SUPABASE_URL         = https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY = service_role キー（RLS をバイパスするため必須）
 */
import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

// ─── Supabase 接続 ────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!   // service_role キー
)

// ─── CSV列定数（0始まりインデックス）────────────────────────────
const COL_CATEGORY     = 1   // B列: 分類名称 / ぬいぐるみ判定
const COL_PRODUCT_NO   = 2   // C列: 商品番号（英数字）
const COL_TITLE        = 3   // D列: 商品名
const COL_EDABAN       = 6   // G列: 枝番
const COL_TANKA_N      = 13  // N列: 税抜単価の分母
const COL_TANKA_P      = 15  // P列: 税抜単価の分子
const COL_PRICE        = 19  // T列: 販売価格（税込）
const COL_PLUSH_SIZE   = 31  // AF列: サイズ記述（ぬいぐるみフラグ判定）
const COL_AK_CODE      = 36  // AK列: 商品区分コード（取込フィルタ）
const COL_PRODUCT_NO3  = 40  // AO列: 商品番号3（9桁数値）
const COL_AX_CONTENT   = 49  // AX列: コンテンツ名/キャラクター名

// 取込対象の商品区分コード（GASから移植）
const TARGET_AK_CODES = new Set([
  'DOAC','ACID','ACMA','ACST','APA','APID','APMA',
  'COID','COMA','COTT','CRBM','CRIB','DOZA','HAPY',
  'JEID','JEMA','JEW','NCCO','NU','POID','POMA','POST',
  'SK08','SQU','ST','STID','STMA','SYOK','TABL','TAID',
  'TAMA','TRIB','ZAID','ZAMA','ZA','CRAG','TF'
])

// ─── ぬいぐるみフラグ判定 ─────────────────────────────────────
function calcPlushFlag(category: string, sizeCol: string): number {
  if (category !== 'ぬいぐるみ') return 0
  if (!sizeCol.includes('cm') && !sizeCol.includes('ｃｍ')) return 0

  const normalized = sizeCol
    .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/ｃｍ/g, 'cm')

  const matches = normalized.match(/(\d+(?:\.\d+)?)cm/gi) ?? []
  for (const m of matches) {
    if (parseFloat(m.replace(/cm/i, '')) >= 20) return 1
  }
  return 0
}

// ─── メイン処理 ───────────────────────────────────────────────
async function main() {
  const [,, csvPath, storeId] = process.argv
  if (!csvPath || !storeId) {
    console.error('使い方: npx tsx scripts/csv-import.ts <csvファイルパス> <store_id>')
    process.exit(1)
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('.env.local に SUPABASE_URL と SUPABASE_SERVICE_KEY を設定してください')
    process.exit(1)
  }

  console.log(`読み込み中: ${csvPath}`)
  const raw = fs.readFileSync(csvPath)
  const rows: string[][] = parse(raw, {
    relax_column_count: true,
    skip_empty_lines: true,
    encoding: 'utf8',
  })

  console.log(`総行数: ${rows.length}`)

  const records: Record<string, unknown>[] = []
  let skipped = 0

  for (const row of rows) {
    const akCode = (row[COL_AK_CODE] ?? '').trim()
    if (!TARGET_AK_CODES.has(akCode)) { skipped++; continue }

    const rawCode = (row[COL_PRODUCT_NO3] ?? '').replace(/\.0$/, '').trim()
    if (!/^\d{9}$/.test(rawCode)) { skipped++; continue }

    // コンテンツ名 / キャラクター名 分割
    const axRaw = (row[COL_AX_CONTENT] ?? '').trim()
    let contentName = '', characterName = ''
    if (axRaw) {
      const slash = axRaw.indexOf('/')
      if (slash >= 0) {
        contentName   = axRaw.slice(0, slash).trim()
        characterName = axRaw.slice(slash + 1).trim()
      } else {
        contentName = axRaw
      }
    }

    const category = (row[COL_CATEGORY] ?? '').trim()
    const tankaP   = Number(row[COL_TANKA_P]) || 0
    const tankaN   = Number(row[COL_TANKA_N]) || 0
    const usedPrice = tankaN !== 0 ? Math.round(tankaP / tankaN) : 0

    // コア列以外は extra JSONB に格納
    const extra: Record<string, unknown> = {}
    row.forEach((val, i) => {
      const skip = new Set([
        COL_CATEGORY, COL_PRODUCT_NO, COL_TITLE, COL_EDABAN,
        COL_TANKA_N, COL_TANKA_P, COL_PRICE, COL_PLUSH_SIZE,
        COL_AK_CODE, COL_PRODUCT_NO3, COL_AX_CONTENT
      ])
      if (!skip.has(i) && val !== '') extra[`col_${i}`] = val
    })

    records.push({
      store_id:      storeId,
      product_no:    (row[COL_PRODUCT_NO] ?? '').trim() || null,
      product_no3:   rawCode,
      branch_no:     row[COL_EDABAN] ? Number(row[COL_EDABAN]) || null : null,
      title:         (row[COL_TITLE] ?? '').trim() || null,
      genre_code:    akCode,
      genre_name:    contentName || null,    // AXコンテンツ名をジャンル名として仮置き
      price_comment: characterName || null,
      used_price:    usedPrice || null,
      new_price:     row[COL_PRICE] ? Number(row[COL_PRICE]) || null : null,
      extra,
      // plushFlag は extra に保存（shelves マッチング時に参照）
    })
  }

  console.log(`取込対象: ${records.length}件 / スキップ: ${skipped}件`)
  if (records.length === 0) {
    console.log('取込対象がありません。')
    return
  }

  // 対象店舗の在庫を全削除（洗い替え）
  console.log(`店舗 ${storeId} の既存在庫を削除中...`)
  const { error: delErr } = await supabase
    .from('inventory')
    .delete()
    .eq('store_id', storeId)
  if (delErr) throw new Error(`削除エラー: ${delErr.message}`)

  // バッチINSERT（1000件ずつ）
  const BATCH = 1000
  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase.from('inventory').insert(batch)
    if (error) throw new Error(`INSERT エラー (offset ${i}): ${error.message}`)
    inserted += batch.length
    process.stdout.write(`\r進捗: ${inserted}/${records.length}件`)
  }

  console.log(`\n完了: ${inserted}件 を投入しました`)
}

main().catch(err => { console.error(err); process.exit(1) })
