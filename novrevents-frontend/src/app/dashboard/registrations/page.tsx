'use client'

import { PageHeader } from '@/components/common'
import { RegistrationList } from '@/components/tickets/registration-list'

export default function MyRegistrationsPage() {
  return (
    <>
      <PageHeader
        title="My registrations"
        description="Every event you registered for, including ones awaiting review or cancelled."
      />
      <RegistrationList ticketsOnly={false} />
    </>
  )
}
