// Writes a contact sheet of the demo cover artwork: `npx tsx scripts/demo/preview-artwork.ts <out.png>`
import sharp from 'sharp'
import { ARTWORK, renderArtwork, type ArtworkKey } from './artwork.js'

const out = process.argv[2] ?? 'artwork-preview.png'
const tiles: Buffer[] = []
for (const key of Object.keys(ARTWORK) as ArtworkKey[]) {
  tiles.push(
    await sharp(await renderArtwork(key))
      .resize(400, 225)
      .png()
      .toBuffer(),
  )
}
await sharp({ create: { width: 1600, height: 450, channels: 3, background: '#ffffff' } })
  .composite(
    tiles.map((input, i) => ({ input, left: (i % 4) * 400, top: Math.floor(i / 4) * 225 })),
  )
  .png()
  .toFile(out)
console.log(`Wrote ${out}`)
