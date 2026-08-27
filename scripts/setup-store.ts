/**
 * 初期セットアップ: 組織・店舗レコードを作成して store_id を表示する
 * 使い方: npx tsx scripts/setup-store.ts
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
  // ── 1. 組織（本部）を作成 ─────────────────────────────────
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ org_type: 'honbu', org_name: '駿河屋' })
    .select('org_id')
    .single()

  if (orgErr) throw new Error(`organizations INSERT エラー: ${orgErr.message}`)
  console.log(`組織作成: org_id = ${org.org_id}`)

  // ── 2. 店舗を作成 ─────────────────────────────────────────
  const stores = [
    { store_code: 'machida-modi',    store_name: '町田モディ店' },
    { store_code: 'machida-asahi',   store_name: '町田旭町店' },
  ]

  for (const s of stores) {
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .insert({ org_id: org.org_id, ...s })
      .select('store_id, store_code, store_name')
      .single()

    if (storeErr) throw new Error(`stores INSERT エラー: ${storeErr.message}`)
    console.log(`店舗作成: [${store.store_code}] ${store.store_name} → store_id = ${store.store_id}`)
  }

  console.log('\n↑ この store_id を csv-import.ts の第2引数に渡してください')
}

main().catch(err => { console.error(err); process.exit(1) })
