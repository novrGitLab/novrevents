// Original cover artwork for the local demo events. Each poster is a distinct, abstract editorial
// composition drawn here as SVG and rasterised with sharp. No stock imagery, no third-party assets.
import sharp from 'sharp'

const W = 1600
const H = 900
const FONT = `font-family="Inter, 'Segoe UI', Arial, Helvetica, sans-serif"`

/** Deterministic pseudo-random numbers so the artwork is identical on every run. */
function rng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const svg = (body: string, bg: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${body}</svg>`

const label = (
  x: number,
  y: number,
  text: string,
  fill: string,
  size = 30,
  weight = 600,
  spacing = 0,
) =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${size}" font-weight="${weight}" letter-spacing="${spacing}" fill="${fill}">${text}</text>`

/** Cybernovr Security Summit — segmented rings echoing the brand's ring, on graphite. */
function summit() {
  const cx = 1150
  const cy = 450
  let body = ''
  const colours = ['#662F8E', '#4451A2', '#EB2027']
  for (let i = 0; i < 9; i += 1) {
    const r = 90 + i * 52
    const c = colours[i % 3]!
    const gap = 0.18 + (i % 4) * 0.07
    const start = (i * 47) % 360
    const circumference = 2 * Math.PI * r
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-opacity="${0.95 - i * 0.07}" stroke-width="14" stroke-dasharray="${circumference * (1 - gap)} ${circumference * gap}" transform="rotate(${start} ${cx} ${cy})"/>`
  }
  body += label(96, 150, 'CYBERNOVR', '#A1A1AA', 26, 600, 6)
  body += label(96, 640, 'Security', '#FAFAFA', 112, 700, -3)
  body += label(96, 760, 'Summit 2026', '#FAFAFA', 112, 700, -3)
  return svg(body, '#141416')
}

/** Blue Team Bootcamp — an alert heatmap grid with a few cells lit. */
function blueTeam() {
  const rand = rng(7)
  let body = ''
  const size = 46
  const gap = 10
  for (let row = 0; row < 14; row += 1) {
    for (let col = 0; col < 26; col += 1) {
      const x = 120 + col * (size + gap)
      const y = 60 + row * (size + gap)
      if (x > W - 80 || y > H - 60) continue
      const v = rand()
      const fill = v > 0.965 ? '#F5F7FF' : v > 0.82 ? '#3B4C9E' : v > 0.5 ? '#26326E' : '#1C2552'
      body += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="6" fill="${fill}"/>`
    }
  }
  body += `<rect x="0" y="${H - 190}" width="${W}" height="190" fill="#121838" fill-opacity="0.92"/>`
  body += label(120, H - 98, 'Blue Team Bootcamp', '#F5F7FF', 72, 700, -2)
  body += label(120, H - 50, 'Detect · Triage · Respond', '#9AA6E8', 26, 500, 1)
  return svg(body, '#18204A')
}

/** Capture the Flag Nigeria — bold diagonal bands and a terminal-style flag string. */
function ctf() {
  let body = ''
  body += `<polygon points="0,0 620,0 220,${H} 0,${H}" fill="#0B6E4F"/>`
  body += `<polygon points="620,0 760,0 360,${H} 220,${H}" fill="#F4F1EA"/>`
  body += `<polygon points="760,0 ${W},0 ${W},${H} 360,${H}" fill="#101312"/>`
  const lines = [
    '$ nc ctf.example.test 1337',
    '> category: web, pwn, forensics',
    '> teams: 4 max',
    'flag{36_hours_of_hacking}',
  ]
  lines.forEach((line, index) => {
    body += `<text x="760" y="${330 + index * 64}" font-family="Consolas, 'Courier New', monospace" font-size="38" fill="${index === 3 ? '#3DDC97' : '#C9D1CD'}">${line}</text>`
  })
  body += label(760, 210, 'Capture the Flag Nigeria', '#FFFFFF', 64, 700, -1.5)
  return svg(body, '#101312')
}

/** Cloud Security Masterclass — stacked, offset layers suggesting shared-responsibility tiers. */
function cloud() {
  let body = ''
  const tiers = ['#DCE6F2', '#C3D4EA', '#A6BEDF', '#7F9FCC', '#4F74AE', '#2D4F8A']
  tiers.forEach((fill, index) => {
    const w = 760 - index * 70
    const x = 760 + index * 35
    const y = 160 + index * 95
    body += `<rect x="${x}" y="${y}" width="${w}" height="120" rx="18" fill="${fill}"/>`
  })
  body += label(110, 420, 'Cloud Security', '#14243F', 84, 700, -2.5)
  body += label(110, 520, 'Masterclass', '#14243F', 84, 700, -2.5)
  body += label(110, 600, 'IAM · Posture · Workloads', '#4A5D7E', 28, 500)
  return svg(body, '#EEF3F9')
}

/** Women in Cybersecurity Africa — overlapping circles in warm tones. */
function wica() {
  let body = ''
  const circles: Array<[number, number, number, string, number]> = [
    [1040, 330, 260, '#C2562F', 1],
    [1290, 540, 230, '#7A2E5C', 0.92],
    [910, 640, 190, '#E2A33B', 0.9],
    [1380, 210, 120, '#F1D2B6', 1],
  ]
  for (const [cx, cy, r, fill, opacity] of circles)
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" fill-opacity="${opacity}"/>`
  body += label(100, 330, 'Women in', '#2B1A14', 90, 700, -2.5)
  body += label(100, 430, 'Cybersecurity', '#2B1A14', 90, 700, -2.5)
  body += label(100, 530, 'Africa', '#2B1A14', 90, 700, -2.5)
  body += label(100, 620, 'Leadership · Careers · Community', '#7A5A4C', 28, 500)
  return svg(body, '#FBF3EA')
}

/** Cyber Risk & GRC Forum — a 5×5 risk matrix on paper. */
function grc() {
  let body = ''
  const shades = ['#E7EFE4', '#F2E9C9', '#F3D3A8', '#EDAE8A', '#D9776A']
  const size = 104
  for (let likelihood = 0; likelihood < 5; likelihood += 1) {
    for (let impact = 0; impact < 5; impact += 1) {
      const score = Math.min(4, Math.floor((likelihood + impact) / 2))
      const x = 900 + impact * (size + 8)
      const y = 150 + (4 - likelihood) * (size + 8)
      body += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="6" fill="${shades[score]}"/>`
    }
  }
  body += `<circle cx="${900 + 3 * 112 + 52}" cy="${150 + 1 * 112 + 52}" r="16" fill="#3A2A20"/>`
  body += `<circle cx="${900 + 1 * 112 + 52}" cy="${150 + 3 * 112 + 52}" r="16" fill="#3A2A20" fill-opacity="0.55"/>`
  body += label(110, 380, 'Cyber Risk', '#2E2721', 88, 700, -2.5)
  body += label(110, 480, '&amp; GRC Forum', '#2E2721', 88, 700, -2.5)
  body += label(110, 560, 'Boards, regulators and risk owners', '#7B6E62', 28, 500)
  return svg(body, '#F7F3EC')
}

/** Offensive Security Lab — contour lines like a terrain map, in red on graphite. */
function offsec() {
  let body = ''
  for (let i = 0; i < 26; i += 1) {
    let d = ''
    for (let x = 0; x <= W; x += 20) {
      const y =
        120 + i * 30 + Math.sin(x / 160 + i * 0.35) * (40 + i * 2) + Math.cos(x / 75 + i) * 12
      d += `${x === 0 ? 'M' : 'L'}${x},${y.toFixed(1)} `
    }
    body += `<path d="${d}" fill="none" stroke="#EB2027" stroke-opacity="${(0.15 + (i % 5) * 0.12).toFixed(2)}" stroke-width="2.4"/>`
  }
  body += `<rect x="80" y="${H - 250}" width="760" height="170" rx="10" fill="#151517"/>`
  body += label(120, H - 160, 'Offensive Security Lab', '#FAFAFA', 58, 700, -1.5)
  body += label(120, H - 112, 'Hands-on · Small group · Bring a laptop', '#B4B4BC', 26, 500)
  return svg(body, '#1B1B1E')
}

/** Campus Cyber Defence Day — stacked type and stripes on ochre. */
function campus() {
  let body = ''
  for (let i = 0; i < 12; i += 1) {
    body += `<rect x="${980 + i * 48}" y="0" width="22" height="${H}" fill="#1F1A10" fill-opacity="${(0.08 + i * 0.06).toFixed(2)}"/>`
  }
  body += label(100, 300, 'CAMPUS', '#1F1A10', 150, 800, -4)
  body += label(100, 450, 'CYBER', '#1F1A10', 150, 800, -4)
  body += label(100, 600, 'DEFENCE DAY', '#1F1A10', 110, 800, -3)
  body += label(104, 680, 'Student teams · Live exercises · Careers fair', '#5C4B21', 28, 500)
  return svg(body, '#E8B93E')
}

export const ARTWORK = { summit, blueTeam, ctf, cloud, wica, grc, offsec, campus } as const
export type ArtworkKey = keyof typeof ARTWORK

export async function renderArtwork(key: ArtworkKey): Promise<Buffer> {
  return sharp(Buffer.from(ARTWORK[key]())).png().toBuffer()
}
