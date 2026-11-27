import { sha256 } from '../../lib/crypto.js'
import { badRequest } from '../../lib/errors.js'
import type { Tx } from '../../lib/db.js'
export async function consumeEntryProof(tx: Tx, email: string, proof: string) {
  const claimed = await tx.emailEntry.deleteMany({
    where: { email, proofHash: sha256(proof), expiresAt: { gt: new Date() } },
  })
  if (!claimed.count) throw badRequest('Verify your email to continue.', 'INVALID_PROOF')
}
