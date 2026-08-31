/**
 * contents テーブルの重複行を削除するスクリプト
 * 同一 content_name + area の行が複数ある場合、
 * shelf_contents の紐付きが多い方 or 古い方を1件だけ残して他を削除
 */
import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function main() {
  const [,, storeId] = process.argv
  if (!storeId) { console.error('使い方: npx tsx scripts/dedup-contents.ts <store_id>'); process.exit(1) }

  const { data: contents } = await supabase
    .from('contents')
    .select('id, content_name, area, is_active, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true })

  // キーごとにグループ化
  const groups = new Map<string, { id: string; created_at: string }[]>()
  for (const c of contents ?? []) {
    const key = `${c.content_name}__${c.area ?? ''}`
    const group = groups.get(key) ?? []
    group.push({ id: c.id, created_at: c.created_at })
    groups.set(key, group)
  }

  // 重複グループの2件目以降を削除
  const toDelete: string[] = []
  for (const [key, rows] of groups.entries()) {
    if (rows.length > 1) {
      const extras = rows.slice(1) // 最初の1件を残す
      console.log(`重複 ${key}: ${rows.length}件 → 1件に (${extras.length}件削除)`)
      for (const r of extras) toDelete.push(r.id)
    }
  }

  if (toDelete.length === 0) { console.log('重複なし'); return }

  // shelf_contents の紐付きを先に削除
  const { error: scErr } = await supabase.from('shelf_contents').delete().in('content_id', toDelete)
  if (scErr) throw new Error(`shelf_contents削除エラー: ${scErr.message}`)

  // contents を削除
  const { error: cErr } = await supabase.from('contents').delete().in('id', toDelete)
  if (cErr) throw new Error(`contents削除エラー: ${cErr.message}`)

  console.log(`✓ ${toDelete.length}件の重複行を削除しました`)
}

main().catch(err => { console.error(err); process.exit(1) })
