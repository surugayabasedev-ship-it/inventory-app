import { readFileSync } from 'fs'
import { readdirSync } from 'fs'

const files = readdirSync('C:/dev/inventory-app/CSV').filter(f => f.endsWith('.csv'))
const raw = readFileSync('C:/dev/inventory-app/CSV/' + files[0])
const decoder = new TextDecoder('shift-jis')
const text = decoder.decode(raw)
const lines = text.split('\n').filter(l => l.trim())

// ワンピース ACST行の全列を表示
console.log('=== ワンピース/ACST 行の全列 ===')
let found = 0
for (const line of lines) {
  const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''))
  if (cols[36] === 'ACST' && (cols[49] || '').includes('ワンピース')) {
    console.log(`\n--- 行 ${found+1} ---`)
    cols.forEach((v, i) => { if (v.trim()) console.log(`  col${i}: [${v.trim()}]`) })
    found++
    if (found >= 2) break
  }
}

// col36 以外でジャンルコード・プライスコメントになりそうな列を探す
console.log('\n=== AK=FG (フィギュア) ワンピース行 ===')
found = 0
for (const line of lines) {
  const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''))
  if (cols[36] === 'FG' && (cols[49] || '').includes('ワンピース')) {
    console.log(`\n--- FG行 ---`)
    cols.forEach((v, i) => { if (v.trim()) console.log(`  col${i}: [${v.trim()}]`) })
    found++
    if (found >= 1) break
  }
}
