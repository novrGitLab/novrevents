'use client'

import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/common'
import { CreateFormDialog } from '@/components/forms/form-list'

/** Direct link to the "new form" dialog (used from the dashboard). */
export default function NewFormPage() {
  const router = useRouter()
  return (
    <>
      <PageHeader title="New form" />
      <CreateFormDialog
        open
        onOpenChange={(open) => !open && router.push('/dashboard/forms')}
        allowRegistration={false}
      />
    </>
  )
}
