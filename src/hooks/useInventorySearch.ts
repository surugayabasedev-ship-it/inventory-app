import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeBarcode } from '../lib/barcode'
import { getSearchGroupKey } from '../lib/inventoryRouting'
import type { InventoryItem, ShelfInfo } from '../types/inventory'

export type SearchMode = 'barcode' | 'product_no' | 'content_name'
export type { InventoryItem, ShelfInfo }

export interface SearchResult {
  status: 'found' | 'not_found' | 'out_of_scope' | 'no_shelf'
  items: InventoryItem[]
  query: string
}

async function fetchShelves(storeId: string, genreCodes: string[]): Promise<ShelfInfo[]> {
  if (!genreCodes.length) return []
  const { data } = await supabase
    .from('shelf_categories')
    .select('genre_code, shelves!inner(shelf_no, x, y)')
    .in('genre_code', genreCodes)
    .eq('shelves.store_id', storeId)
  if (!data) return []
  return (data as any[]).flatMap(d => d.shelves ?? [])
}

export function useInventorySearch(storeId: string) {
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (query: string, mode: SearchMode) => {
    // 全角スペース含む連続空白を半角スペース1つに統一
    const q = query.trim().replace(/[\s　]+/g, ' ')
    if (!q) return

    setLoading(true)
    setResult(null)

    try {
      if (mode === 'barcode' || mode === 'product_no') {
        let code = q
        let searchField: 'product_no3' | 'product_no' = 'product_no3'

        if (mode === 'barcode') {
          const bc = normalizeBarcode(q)
          if (bc.type === 'product_no3') {
            code = bc.code
            searchField = 'product_no3'
          } else if (bc.type === 'product_no') {
            code = bc.code
            searchField = 'product_no'
          } else {
            // 認識できないバーコード → 9桁数値かどうかで判断
            code = bc.raw
            searchField = /^\d{9}$/.test(bc.raw) ? 'product_no3' : 'product_no'
          }
        } else {
          // 商品番号直接入力: 9桁数値 → product_no3、それ以外 → product_no
          searchField = /^\d{9}$/.test(q) ? 'product_no3' : 'product_no'
        }

        const { data, error } = await supabase
          .from('inventory')
          .select('product_no3, product_no, title, content_name, genre_name, genre_label, price_comment, genre_code, genre_code2, category_name, ak_abbr, size_desc')
          .eq('store_id', storeId)
          .eq(searchField, code)
          .limit(1)

        if (error) throw error
        if (!data || data.length === 0) {
          setResult({ status: 'not_found', items: [], query: q })
          return
        }

        const item = data[0]
        // ジャンルコード(genre_code2)→棚マッチング、なければ分類コード(genre_code)
        const matchCode = item.genre_code2 || item.genre_code
        const shelves = await fetchShelves(storeId, matchCode ? [matchCode] : [])

        setResult({
          status: shelves.length > 0 ? 'found' : 'no_shelf',
          items: [{ ...item, shelves }],
          query: q,
        })

      } else {
        // コンテンツ名検索: 複数フィールドを部分一致でOR検索
        // genre_name=コンテンツ名, genre_label=ジャンル名称("ワンピース(トレカ)"等), price_comment=プライスコメント
        const { data, error } = await supabase
          .from('inventory')
          .select('product_no3, product_no, title, content_name, genre_name, genre_label, price_comment, genre_code, genre_code2, category_name, ak_abbr, size_desc')
          .eq('store_id', storeId)
          .eq('ak_abbr', 'ザッカ')
          .or(`content_name.ilike.%${q}%,genre_name.ilike.%${q}%,genre_label.ilike.%${q}%,price_comment.ilike.%${q}%`)
          .limit(100)

        if (error) throw error
        if (!data || data.length === 0) {
          setResult({ status: 'not_found', items: [], query: q })
          return
        }

        // content_name × 種別(getContentTypeName)でグループ化
        const byGenre = new Map<string, typeof data[0]>()
        for (const row of data) {
          const key = getSearchGroupKey(row as InventoryItem)
          if (!byGenre.has(key)) byGenre.set(key, row)
        }

        const genreCodes = [...byGenre.keys()]
        const shelves = await fetchShelves(storeId, genreCodes)
        // 簡易: 全shelvesを各アイテムに割り当て（棚未実装中の暫定）
        const items: InventoryItem[] = [...byGenre.entries()].map(([, row]) => ({
          ...row,
          shelves: shelves,
        }))

        setResult({
          status: items.length > 0 ? (shelves.length > 0 ? 'found' : 'no_shelf') : 'not_found',
          items,
          query: q,
        })
      }
    } catch (e) {
      console.error(e)
      setResult({ status: 'not_found', items: [], query: q })
    } finally {
      setLoading(false)
    }
  }, [storeId])

  const clear = useCallback(() => setResult(null), [])

  return { result, loading, search, clear }
}
