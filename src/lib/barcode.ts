/**
 * バーコードスキャン結果を商品コードに変換する
 *
 * タイプ①: 英数字混在（product_no / C列）
 *   例: "1-0001G1420953" → "G1420953"（固定プレフィックス "1-0001" を除去）
 *
 * タイプ②: 14桁数値（product_no3 / AO列）
 *   例: "1871-000173368" → "871673368"
 *   前ブロック末尾3桁 + 後ブロック末尾6桁 = 9桁
 */
export type BarcodeResult =
  | { type: 'product_no3'; code: string }   // タイプ②: 9桁数値
  | { type: 'product_no'; code: string }    // タイプ①: 英数字コード
  | { type: 'unknown'; raw: string }

const TYPE1_PREFIX = '1-0001'

export function normalizeBarcode(raw: string): BarcodeResult {
  // スラッシュ除去
  const cleaned = raw.replace(/^\/|\/$/g, '').trim()

  // タイプ①判定: プレフィックス "1-0001" から始まる英数字混在スキャン
  if (cleaned.startsWith(TYPE1_PREFIX)) {
    const code = cleaned.slice(TYPE1_PREFIX.length)
    if (code.length > 0) {
      return { type: 'product_no', code }
    }
  }

  // タイプ②判定: "DDDD-DDDDDDDDDD" または "DDD-DDDDDDDDDD" 形式
  if (cleaned.includes('-')) {
    const [front, rear] = cleaned.split('-')
    if (/^\d+$/.test(front) && /^\d{10}$/.test(rear)) {
      const code = front.slice(-3) + rear.slice(-6)
      if (/^\d{9}$/.test(code)) {
        return { type: 'product_no3', code }
      }
    }
  }

  // ハイフンなしの純粋数値バーコード (13桁 or 14桁)
  const digits = cleaned.replace(/\D/g, '')
  if (digits.length === 13) {
    return { type: 'product_no3', code: digits.slice(0, 3) + digits.slice(7) }
  }
  if (digits.length === 14) {
    return { type: 'product_no3', code: digits.slice(1, 4) + digits.slice(8) }
  }

  return { type: 'unknown', raw }
}

/** バーコード自動検索トリガー判定 */
export function isTriggerBarcode(raw: string): boolean {
  const cleaned = raw.replace(/^\/|\/$/g, '')
  // タイプ①: 固定プレフィックス付き
  if (cleaned.startsWith(TYPE1_PREFIX) && cleaned.length > TYPE1_PREFIX.length) return true
  // タイプ②: DDD-DDDDDDDDDD または DDDD-DDDDDDDDDD
  return /^\d{3,4}-\d{10}$/.test(cleaned)
}
