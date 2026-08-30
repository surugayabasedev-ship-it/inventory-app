/**
 * 在庫仕分けのための棚案内ロジック
 *
 * 対象: 中分類略称 = ザッカ (ｻﾞｯｶ) のみ
 *
 * 分類コード(genre_code)別のルール:
 * - GROUP_A: コンテンツ名 = genre_name (col49前半)
 * - TF: コンテンツ名 = genre_label (col10)、棚は常にTF棚
 * - NU: genre_label基準、サイズ>15cmはぬいぐるみ棚
 * - その他: 分類名称(category_name)単位の棚
 */
import type { InventoryItem } from '../types/inventory'

// プライスコメント(col49)からコンテンツ名を取る分類コード群
export const GROUP_A = new Set([
  'ZA', 'ZAID', 'ZAMA',
  'TAMA', 'TAID', 'TABL',
  'SYOK',
  'STMA', 'STID', 'ST',
  'POST', 'POMA', 'POID',
  'JEW', 'JEMA', 'JEID',
  'CRSL',
  'COTT', 'COMA', 'COID',
  'CL',
  'APA', 'APID', 'APMA',
  'ACST', 'ACMA', 'ACID',
])

/** NU商品のサイズ判定: size_descまたはgenre_labelから cm値を読み取る */
function extractSizeCm(item: InventoryItem): number | null {
  const text = item.size_desc ?? item.genre_label ?? ''
  const match = text.match(/(\d+(?:\.\d+)?)\s*cm/i)
  return match ? parseFloat(match[1]) : null
}

/** 表示するコンテンツ名を返す（バーコード/商品番号モード用） */
export function getContentName(item: InventoryItem): string {
  return item.content_name ?? item.genre_name ?? item.genre_label ?? '—'
}

/** 棚案内の種別を返す */
export type ShelfRouteType =
  | { type: 'content'; label: string }   // コンテンツ名の棚
  | { type: 'tf' }                       // TF棚固定
  | { type: 'plush' }                    // ぬいぐるみ棚(>15cm)
  | { type: 'category'; label: string }  // 分類名称単位の棚

export function getShelfRoute(item: InventoryItem): ShelfRouteType {
  const code = item.genre_code ?? ''

  if (code === 'TF') {
    return { type: 'tf' }
  }

  if (code === 'NU') {
    const sizeCm = extractSizeCm(item)
    if (sizeCm !== null && sizeCm > 15) {
      return { type: 'plush' }
    }
    return { type: 'content', label: item.genre_label ?? '—' }
  }

  if (GROUP_A.has(code)) {
    return { type: 'content', label: item.genre_name ?? item.genre_label ?? '—' }
  }

  // その他: 分類名称単位
  return { type: 'category', label: item.category_name ?? item.genre_label ?? '—' }
}

/** 棚案内ラベルを文字列で返す（棚番号未設定時の表示用） */
export function getShelfRouteLabel(item: InventoryItem): string {
  const route = getShelfRoute(item)
  switch (route.type) {
    case 'tf':       return 'TF棚'
    case 'plush':    return 'ぬいぐるみ棚'
    case 'content':  return `${route.label}棚`
    case 'category': return `${route.label}棚`
  }
}

// ─── コンテンツ名検索結果の表示・グループ化 ────────────────────────

/**
 * 表示・グループキー用の名前正規化
 * 「X シリーズ」→「Xシリーズ」のみ（「仮面ライダー」≠「仮面ライダーシリーズ」は保持）
 * DB保存値は変えず、表示・集約の計算時のみ適用
 */
function normalizeSeriesName(name: string): string {
  return name.replace(/ シリーズ/g, 'シリーズ')
}

/**
 * コンテンツ名検索結果カードの「シリーズ名」部分
 * インポート時に確定した content_name を優先使用（表示時にシリーズスペースだけ正規化）
 */
export function getSearchDisplayName(item: InventoryItem): string {
  const name = item.content_name ?? item.genre_name ?? item.genre_label ?? '—'
  return normalizeSeriesName(name)
}

/**
 * コンテンツ名検索結果カードの「種別」ラベル
 * GROUP_A → "キャラクターグッズ"
 * TF      → "トレカ"
 * NU      → "ぬいぐるみ"
 * Others  → category_name (例: "フィギュア")
 */
export function getContentTypeName(item: InventoryItem): string {
  const code = item.genre_code ?? ''
  if (GROUP_A.has(code)) return 'キャラクターグッズ'
  if (code === 'TF') return 'トレカ'
  if (code === 'NU') return 'ぬいぐるみ'
  return item.category_name ?? code
}

/** コンテンツ名検索用グループキー（正規化した名前 × 種別で集約） */
export function getSearchGroupKey(item: InventoryItem): string {
  const name = item.content_name ?? item.genre_name ?? item.genre_label ?? 'unknown'
  return `${normalizeSeriesName(name)}|${getContentTypeName(item)}`
}
