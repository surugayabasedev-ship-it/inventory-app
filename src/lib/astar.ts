export interface GridCell {
  label: string  // 空文字 = 通路, それ以外 = 棚（壁）
}

export interface Point {
  r: number
  c: number
}

/** 壁セルに対して隣接する通路セルを探す（経路探索の起点/終点補正） */
function nearest(grid: GridCell[][], r: number, c: number): Point {
  if (grid[r]?.[c]?.label === '') return { r, c }
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc
    if (grid[nr]?.[nc]?.label === '') return { r: nr, c: nc }
  }
  return { r, c }
}

function manhattan(a: Point, b: Point) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c)
}

/**
 * A* 経路探索
 * grid[r][c].label === '' が通路、それ以外が壁
 * 返り値: 経路のPoint配列（start→goal順）、到達不能な場合は null
 */
export function findPath(grid: GridCell[][], start: Point, goal: Point): Point[] | null {
  const s = nearest(grid, start.r, start.c)
  const g = nearest(grid, goal.r, goal.c)

  type Node = { r: number; c: number; gv: number; f: number; parent: string | null }
  const key = (r: number, c: number) => `${r},${c}`

  const open = new Map<string, Node>()
  const nodeStore = new Map<string, Node>()
  const closed = new Set<string>()

  const startNode: Node = { r: s.r, c: s.c, gv: 0, f: manhattan(s, g), parent: null }
  open.set(key(s.r, s.c), startNode)
  nodeStore.set(key(s.r, s.c), startNode)

  let iterations = 0
  while (open.size > 0 && iterations < 3000) {
    iterations++

    // f値最小ノードを選択
    let cur: Node | null = null
    for (const node of open.values()) {
      if (!cur || node.f < cur.f) cur = node
    }
    if (!cur) break

    const ck = key(cur.r, cur.c)
    open.delete(ck)
    closed.add(ck)

    if (cur.r === g.r && cur.c === g.c) {
      const path: Point[] = []
      let node: Node | null = cur
      while (node) {
        path.unshift({ r: node.r, c: node.c })
        node = node.parent ? (nodeStore.get(node.parent) ?? null) : null
      }
      return path
    }

    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = cur.r + dr, nc = cur.c + dc
      const nk = key(nr, nc)
      if (closed.has(nk) || !grid[nr]?.[nc] || grid[nr][nc].label !== '') continue

      const gv = cur.gv + 1
      const existing = open.get(nk)
      if (!existing || gv < existing.gv) {
        const newNode: Node = { r: nr, c: nc, gv, f: gv + manhattan({ r: nr, c: nc }, g), parent: ck }
        open.set(nk, newNode)
        nodeStore.set(nk, newNode)
      }
    }
  }
  return null
}

/** 移動方向を矢印文字で返す */
export function dirArrow(from: Point, to: Point): string {
  if (to.r < from.r) return '↑'
  if (to.r > from.r) return '↓'
  if (to.c < from.c) return '←'
  if (to.c > from.c) return '→'
  return '●'
}
