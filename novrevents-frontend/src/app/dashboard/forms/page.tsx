'use client'

import { PageHeader } from '@/components/common'
import { FormList } from '@/components/forms/form-list'

export default function FormsPage() {
  return (
    <>
      <PageHeader
        title="Forms"
        description="Every form you can manage — standalone or attached to an event. Respondents never need an account."
      />
      <FormList />
    </>
  )
}
