import { cn } from '@/lib/utils'

/**
 * A QR-shaped illustration for marketing artwork. It encodes nothing and is hidden from assistive
 * technology. Like every QR code in the product it is black on white in both themes.
 */
const SIZE = 21

function isFinder(x: number, y: number) {
  const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7
  return inBox(0, 0) || inBox(SIZE - 7, 0) || inBox(0, SIZE - 7)
}

function finderOn(x: number, y: number) {
  const lx = x >= SIZE - 7 ? x - (SIZE - 7) : x
  const ly = y >= SIZE - 7 ? y - (SIZE - 7) : y
  const ring = lx === 0 || lx === 6 || ly === 0 || ly === 6
  const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4
  return ring || core
}

function isSeparator(x: number, y: number) {
  const near = (ox: number, oy: number) => x >= ox - 1 && x <= ox + 7 && y >= oy - 1 && y <= oy + 7
  return (near(0, 0) || near(SIZE - 7, 0) || near(0, SIZE - 7)) && !isFinder(x, y)
}

/** Deterministic pseudo-random modules so server and client render the same artwork. */
function modules(seed: number) {
  const cells: [number, number][] = []
  let state = seed
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (isFinder(x, y)) {
        if (finderOn(x, y)) cells.push([x, y])
        continue
      }
      if (isSeparator(x, y)) continue
      if (y === 6 || x === 6) {
        if ((x + y) % 2 === 0) cells.push([x, y]) // timing patterns
        continue
      }
      state = (state * 1103515245 + 12345) & 0x7fffffff
      if (state % 100 < 47) cells.push([x, y])
    }
  }
  return cells
}

export function QrGlyph({ seed = 7, className }: { seed?: number; className?: string }) {
  const cells = modules(seed)
  return (
    <svg
      viewBox={`-1 -1 ${SIZE + 2} ${SIZE + 2}`}
      className={cn('block bg-white', className)}
      aria-hidden
      focusable="false"
      shapeRendering="crispEdges"
    >
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#000" />
      ))}
    </svg>
  )
}
