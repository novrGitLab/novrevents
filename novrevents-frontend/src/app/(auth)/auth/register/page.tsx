import { redirect } from 'next/navigation'
import { safeNextPath } from '@/lib/utils'
export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  redirect(next ? '/auth/login?next=' + encodeURIComponent(safeNextPath(next)) : '/auth/login')
}
