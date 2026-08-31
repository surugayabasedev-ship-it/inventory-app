export interface ShelfInfo {
  shelf_no: number
  x: number
  y: number
}

export interface InventoryItem {
  product_no3: string | null
  product_no: string | null
  title: string | null
  content_name: string | null  // インポート時に確定したコンテンツ名（表示・検索の主キー）
  genre_name: string | null    // コンテンツ名（col49 前半）
  genre_label: string | null   // ジャンル名称（col10: "ワンピース(トレカ)"等）
  price_comment: string | null // プライスコメント（col49 後半）
  genre_code: string | null    // 分類コード（col36: ACST, FG等）
  genre_code2: string | null   // ジャンルコード（col37: H133, 7623等）
  category_name: string | null // 分類名称（col1: フィギュア, アクリルスタンド（キャラ）等）
  ak_abbr: string | null       // 中分類略称（col0: ザッカ等）
  size_desc: string | null     // サイズ記述（col31: NU棚判定用）
  used_price: number | null    // 税抜単価（tanka_p / tanka_n）
  branch_no: number | null     // 枝番
  shelves: ShelfInfo[]
  contentStatus?: 'found' | 'no_shelf' | 'inactive' | 'unregistered'
}

// ─── 買戻し関連 ────────────────────────────────────────────────

export interface BuybackItem {
  id: string                   // UUID（重複防止キー）
  product_no3: string | null
  product_no: string | null
  title: string | null
  content_name: string | null
  used_price: number | null    // 税抜単価
  branch_no: number | null     // 枝番
}

export interface BuybackBatch {
  id: string
  label: string                // yyyymmddhhmm（ファイル名用）
  moved_at: string             // ISO datetime
  items: BuybackItem[]
}
