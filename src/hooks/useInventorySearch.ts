import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeBarcode } from '../lib/barcode'
import { GROUP_A, getSearchGroupKey, getShelfRoute } from '../lib/inventoryRouting'
import type { InventoryItem, ShelfInfo } from '../types/inventory'

export type SearchMode = 'barcode' | 'product_no' | 'content_name'
export type { InventoryItem, ShelfInfo }

export interface SearchResult {
  status: 'found' | 'not_found' | 'out_of_scope' | 'no_shelf'
  items: InventoryItem[]
  query: string
}

// genre_code ベースの棚取得（shelf_categories 経由、TF/NU/その他向け）
async function fetchShelvesByGenreCode(storeId: string, genreCodes: string[]): Promise<ShelfInfo[]> {
  if (!genreCodes.length) return []
  const { data } = await supabase
    .from('shelf_categories')
    .select('genre_code, shelves!inner(shelf_no, x, y)')
    .in('genre_code', genreCodes)
    .eq('shelves.store_id', storeId)
  if (!data) return []
  return (data as any[]).flatMap(d => d.shelves ?? [])
}

// コンテンツ名ベースの棚取得（contents → shelf_contents → shelves、GROUP_A向け）
async function fetchShelvesByContentNames(
  storeId: string,
  contentNames: string[]
): Promise<Map<string, ShelfInfo[]>> {
  if (!contentNames.length) return new Map()

  const { data: contentsData } = await supabase
    .from('contents')
    .select('id, content_name')
    .eq('store_id', storeId)
    .in('content_name', contentNames)
  if (!contentsData || contentsData.length === 0) return new Map()

  const contentIds = contentsData.map(c => c.id)
  const idToName = new Map(contentsData.map(c => [c.id, c.content_name as string]))

  const { data: scData } = await supabase
    .from('shelf_contents')
    .select('content_id, shelf_id')
    .in('content_id', contentIds)
  if (!scData || scData.length === 0) return new Map()

  const shelfIds = [...new Set(scData.map(sc => sc.shelf_id))]

  const { data: shelvesData } = await supabase
    .from('shelves')
    .select('shelf_id, shelf_no, x, y')
    .in('shelf_id', shelfIds)
    .eq('store_id', storeId)
  if (!shelvesData) return new Map()

  const shelfById = new Map(shelvesData.map(s => [s.shelf_id, s as ShelfInfo & { shelf_id: string }]))

  const result = new Map<string, ShelfInfo[]>()
  for (const sc of scData) {
    const name = idToName.get(sc.content_id)
    const shelf = shelfById.get(sc.shelf_id)
    if (!name || !shelf) continue
    const arr = result.get(name) ?? []
    arr.push({ shelf_no: shelf.shelf_no, x: shelf.x, y: shelf.y })
    result.set(name, arr)
  }
  return result
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
          .select('product_no3, product_no, title, content_name, genre_name, genre_label, price_comment, genre_code, genre_code2, category_name, ak_abbr, size_desc, used_price, branch_no')
          .eq('store_id', storeId)
          .eq(searchField, code)
          .limit(1)

        if (error) throw error
        if (!data || data.length === 0) {
          setResult({ status: 'not_found', items: [], query: q })
          return
        }

        const item = data[0] as InventoryItem
        const route = getShelfRoute(item)
        let shelves: ShelfInfo[] = []

        if (route.type === 'content') {
          // GROUP_A / NU コンテンツ棚: contents → shelf_contents → shelves で引く
          const contentName = item.content_name ?? item.genre_name ?? null
          if (contentName) {
            const shelvesMap = await fetchShelvesByContentNames(storeId, [contentName])
            shelves = shelvesMap.get(contentName) ?? []
          }
        } else {
          // TF / category: genre_code で shelf_categories 経由
          const matchCode = item.genre_code2 || item.genre_code
          shelves = await fetchShelvesByGenreCode(storeId, matchCode ? [matchCode] : [])
        }

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
          .select('product_no3, product_no, title, content_name, genre_name, genre_label, price_comment, genre_code, genre_code2, category_name, ak_abbr, size_desc, used_price, branch_no')
          .eq('store_id', storeId)
          .eq('ak_abbr', 'ザッカ')
          .or(`content_name.ilike.%${q}%,genre_name.ilike.%${q}%,genre_label.ilike.%${q}%,price_comment.ilike.%${q}%`)
          .limit(100)

        if (error) throw error
        if (!data || data.length === 0) {
          setResult({ status: 'not_found', items: [], query: q })
          return
        }

        // content_name × 種別でグループ化
        const byGroup = new Map<string, InventoryItem>()
        for (const row of data as InventoryItem[]) {
          const key = getSearchGroupKey(row)
          if (!byGroup.has(key)) byGroup.set(key, row)
        }

        // GROUP_A と それ以外 に分離
        const groupAItems: InventoryItem[] = []
        const otherItems: InventoryItem[] = []
        for (const row of byGroup.values()) {
          if (GROUP_A.has(row.genre_code ?? '')) groupAItems.push(row)
          else otherItems.push(row)
        }

        // GROUP_A: contents → shelf_contents → shelves で取得
        const groupANames = [...new Set(
          groupAItems.map(it => it.content_name ?? it.genre_name).filter(Boolean) as string[]
        )]
        const contentNameShelves = await fetchShelvesByContentNames(storeId, groupANames)

        // その他: genre_code 経由（TF/NU/フィギュア等、shelf_categories がある場合）
        const otherCodes = [...new Set(
          otherItems.map(it => it.genre_code2 || it.genre_code).filter(Boolean) as string[]
        )]
        const categoryShelvesAll = await fetchShelvesByGenreCode(storeId, otherCodes)

        const items: InventoryItem[] = [
          ...groupAItems.map(it => {
            const name = it.content_name ?? it.genre_name ?? null
            return { ...it, shelves: name ? (contentNameShelves.get(name) ?? []) : [] }
          }),
          ...otherItems.map(it => ({ ...it, shelves: categoryShelvesAll })),
        ]

        const anyShelf = items.some(it => it.shelves.length > 0)
        setResult({
          status: items.length > 0 ? (anyShelf ? 'found' : 'no_shelf') : 'not_found',
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
