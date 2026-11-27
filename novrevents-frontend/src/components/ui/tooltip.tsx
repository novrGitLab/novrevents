'use client'

import type { ReactElement } from 'react'
import { Tooltip as Primitive } from 'radix-ui'

export function Tooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Primitive.Provider delayDuration={350}>
      <Primitive.Root>
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content
            sideOffset={6}
            className="bg-foreground text-background z-50 rounded-md px-3 py-1.5 text-xs shadow-sm"
          >
            {label}
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  )
}
