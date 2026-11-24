'use client'

import { PageHeader } from '@/components/common'
import { RegistrationList } from '@/components/tickets/registration-list'

export default function TicketsPage() {
  return (
    <>
      <PageHeader
        title="My tickets"
        description="Show the QR code at check-in, or download the PDF. Each ticket admits one person once."
      />
      <RegistrationList ticketsOnly />
    </>
  )
}
