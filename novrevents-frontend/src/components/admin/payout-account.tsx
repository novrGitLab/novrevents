'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
export function PayoutAccount({ id, name }: { id: string; name: string }) {
  const [code, setCode] = useState('')
  const save = useMutation({
    mutationFn: async () => {
      await ensureCsrfToken()
      return unwrap(
        api.PUT('/api/v1/admin/users/{id}/payout', { params: { path: { id } }, body: { code: code.trim() } }),
      )
    },
  })
  return (
    <details className="w-full text-sm">
      <summary className="text-primary cursor-pointer font-medium">Organizer payout</summary>
      <form
        className="mt-2 space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <label htmlFor={'payout-' + id}>Paystack subaccount for {name}</label>
        <Input
          id={'payout-' + id}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          pattern="ACCT_[A-Za-z0-9]{6,64}"
          autoComplete="off"
        />
        <Button size="sm" variant="outline" type="submit" loading={save.isPending}>
          Assign payout account
        </Button>
        {save.isError && <p role="alert">{errorMessage(save.error)}</p>}
        {save.data && <p role="status">Paystack account linked to {save.data.businessName}.</p>}
      </form>
    </details>
  )
}
