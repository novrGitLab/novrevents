import { PageHeader } from '@/components/common'
import { FormList } from '@/components/forms/form-list'
export default function NewFormPage() {
  return (
    <>
      <PageHeader title="Forms" description="Manage event registrations, applications and feedback." />
      <FormList initiallyCreating />
    </>
  )
}
