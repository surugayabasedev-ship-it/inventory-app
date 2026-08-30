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

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ─── CSV列定数（0始まりインデックス）────────────────────────────
const COL_AK_ABBR      = 0   // A列: 中分類略称 (ｻﾞｯｶ, ﾊｰﾄﾞ, etc.)
const COL_CATEGORY     = 1   // B列: 分類名称 (アクリルスタンド（キャラ）, フィギュア, etc.) → category_name
const COL_PRODUCT_NO   = 2   // C列: 商品番号（英数字）
const COL_TITLE        = 3   // D列: 商品名
const COL_EDABAN       = 6   // G列: 枝番
const COL_TANKA_N      = 13  // N列: 税抜単価の分母
const COL_TANKA_P      = 15  // P列: 税抜単価の分子
const COL_PRICE        = 19  // T列: 販売価格（税込）
const COL_PLUSH_SIZE   = 31  // AF列: サイズ記述（ぬいぐるみフラグ判定）
const COL_AK_CODE      = 36  // AK列: 分類コード (AK code: ACST, FG, etc.)
const COL_GENRE_CODE   = 37  // AL列: ジャンルコード (H133, 7623, etc.) - 棚マッチングに使用
const COL_PRODUCT_NO3  = 40  // AO列: 商品番号3（9桁数値）
const COL_GENRE_LABEL  = 10  // K列: ジャンル名称 (ワンピース(トレカ), アクリルスタンド小(10cm未満))
const COL_AX_CONTENT   = 49  // AX列: コンテンツ名/プライスコメント (ワンピース/ウソップ)
const COL_SIZE_DESC    = 31  // AF列: サイズ記述（NU棚判定用: "約15cm" 等）

// ─── 半角カタカナ→全角カタカナ変換 ─────────────────────────────
const HANKAKU_MAP: Record<string, string> = {
  'ｦ':'ヲ','ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ',
  'ｬ':'ャ','ｭ':'ュ','ｮ':'ョ','ｯ':'ッ','ｰ':'ー',
  'ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ',
  'ｶ':'カ','ｷ':'キ','ｸ':'ク','ｹ':'ケ','ｺ':'コ',
  'ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ',
  'ﾀ':'タ','ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト',
  'ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ',
  'ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ',
  'ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ','ﾓ':'モ',
  'ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ',
  'ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ',
  'ﾜ':'ワ','ﾝ':'ン',
  // 濁点・半濁点の組み合わせ
  'ｶﾞ':'ガ','ｷﾞ':'ギ','ｸﾞ':'グ','ｹﾞ':'ゲ','ｺﾞ':'ゴ',
  'ｻﾞ':'ザ','ｼﾞ':'ジ','ｽﾞ':'ズ','ｾﾞ':'ゼ','ｿﾞ':'ゾ',
  'ﾀﾞ':'ダ','ﾁﾞ':'ヂ','ﾂﾞ':'ヅ','ﾃﾞ':'デ','ﾄﾞ':'ド',
  'ﾊﾞ':'バ','ﾋﾞ':'ビ','ﾌﾞ':'ブ','ﾍﾞ':'ベ','ﾎﾞ':'ボ',
  'ﾊﾟ':'パ','ﾋﾟ':'ピ','ﾌﾟ':'プ','ﾍﾟ':'ペ','ﾎﾟ':'ポ',
  'ｳﾞ':'ヴ',
}

function toFullWidth(str: string): string {
  if (!str) return str
  // 濁点・半濁点の組み合わせを先に処理（2文字→1文字）
  let result = str
  for (const [h, z] of Object.entries(HANKAKU_MAP)) {
    if (h.length === 2) result = result.split(h).join(z)
  }
  // 単体の半角カタカナを変換
  for (const [h, z] of Object.entries(HANKAKU_MAP)) {
    if (h.length === 1) result = result.split(h).join(z)
  }
  return result
}

// ─── content_name 計算 ────────────────────────────────────────
const STRIP_CODES_IMPORT = new Set(['FG', 'TF', 'NU'])
const TORECARD_SUFFIXES  = ['（トレカ）', '(トレカ)']

/**
 * インポート時にコンテンツ名を確定する
 * 1. genre_name (col49前半) が取れていればそのまま（全コード共通）
 * 2. FG/TF/NU で genre_label があれば末尾の（トレカ）を除去して使用
 * 3. その他は genre_label をそのまま
 */
/** 空白正規化: 連続空白→1スペース（DB保存用、シリーズ表記は変更しない） */
function normalizeWS(str: string): string {
  return str.replace(/[\s　]+/g, ' ').trim()
}

function computeContentName(akCode: string, genreName: string | null, genreLabel: string | null): string | null {
  if (genreName) return normalizeWS(genreName)
  if (genreLabel) {
    let label = genreLabel
    if (STRIP_CODES_IMPORT.has(akCode)) {
      for (const s of TORECARD_SUFFIXES) {
        if (label.endsWith(s)) { label = label.slice(0, -s.length).trim(); break }
      }
    }
    return normalizeWS(label) || null
  }
  return null
}

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

  // Shift-JIS → UTF-8 デコード
  const rawBytes = fs.readFileSync(csvPath)
  const decoder = new TextDecoder('shift-jis')
  const csvText = decoder.decode(rawBytes)

  const rows: string[][] = parse(csvText, {
    relax_column_count: true,
    skip_empty_lines: true,
  })

  console.log(`総行数: ${rows.length}`)

  const records: Record<string, unknown>[] = []
  let skipped = 0

  for (const row of rows) {
    const akCode = (row[COL_AK_CODE] ?? '').trim()
    if (!akCode) { skipped++; continue }

    const rawCode = (row[COL_PRODUCT_NO3] ?? '').replace(/\.0$/, '').trim()
    if (!/^\d{9}$/.test(rawCode)) { skipped++; continue }

    // コンテンツ名 / プライスコメント 分割（col49: "ワンピース/ウソップ"）
    const axRaw = toFullWidth((row[COL_AX_CONTENT] ?? '').trim())
    let contentName = '', priceComment = ''
    if (axRaw) {
      const slash = axRaw.indexOf('/')
      if (slash >= 0) {
        contentName  = axRaw.slice(0, slash).trim()
        priceComment = axRaw.slice(slash + 1).trim()
      } else {
        contentName = axRaw
      }
    }

    const akAbbr     = toFullWidth((row[COL_AK_ABBR]     ?? '').trim())   // col0: 中分類略称
    const category   = toFullWidth((row[COL_CATEGORY]   ?? '').trim())   // col1: 分類名称
    const genreLabel = toFullWidth((row[COL_GENRE_LABEL] ?? '').trim())  // col10: ジャンル名称
    const genreCode2 = (row[COL_GENRE_CODE] ?? '').trim()                // col37: ジャンルコード
    const title      = toFullWidth((row[COL_TITLE]       ?? '').trim())
    const sizeDesc   = toFullWidth((row[COL_SIZE_DESC]   ?? '').trim())  // col31: サイズ記述
    const tankaP = Number(row[COL_TANKA_P]) || 0
    const tankaN = Number(row[COL_TANKA_N]) || 0
    const usedPrice = tankaN !== 0 ? Math.round(tankaP / tankaN) : 0

    records.push({
      store_id:      storeId,
      product_no:    (row[COL_PRODUCT_NO] ?? '').trim() || null,
      product_no3:   rawCode,
      branch_no:     row[COL_EDABAN] ? Number(row[COL_EDABAN]) || null : null,
      title:         title || null,
      content_name:  computeContentName(akCode, contentName || null, genreLabel || null),
      genre_code:    akCode,
      genre_code2:   genreCode2 || null,
      genre_name:    contentName || null,
      genre_label:   genreLabel || null,
      price_comment: priceComment || null,
      category_name: category || null,
      ak_abbr:       akAbbr || null,
      size_desc:     sizeDesc || null,
      used_price:    usedPrice || null,
      new_price:     row[COL_PRICE] ? Number(row[COL_PRICE]) || null : null,
      extra: {},
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
