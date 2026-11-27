'use client'

import { ImageUp, Trash2 } from '@/components/ui/icons'
import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { upload } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'

const MAX_BYTES = 5 * 1024 * 1024

/** Image picker for avatars, logos, banners and speaker photos. The server re-validates the content. */
export function ImageUpload<T>({
  label,
  currentUrl,
  endpoint,
  onUploaded,
  onRemove,
  aspect = 'square',
}: {
  label: string
  currentUrl: string | null
  endpoint: string
  onUploaded: (result: T) => void
  onRemove?: () => Promise<void>
  aspect?: 'square' | 'banner'
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const id = React.useId()

  const choose = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Choose a JPEG, PNG or WebP image.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Images must be 5 MB or smaller.')
      return
    }
    setBusy(true)
    try {
      const data = new FormData()
      data.append('file', file, file.name)
      onUploaded(await upload<T>(endpoint, data))
      toast.success(`${label} updated`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className={cn('flex gap-4', aspect === 'banner' ? 'flex-col' : 'items-center')}>
        <div
          className={cn(
            'bg-muted overflow-hidden border bg-cover bg-center',
            aspect === 'banner' ? 'aspect-[16/9] w-full max-w-md rounded-lg' : 'size-20 rounded-full',
          )}
          style={currentUrl ? { backgroundImage: `url(${currentUrl})` } : undefined}
          role="img"
          aria-label={currentUrl ? `Current ${label.toLowerCase()}` : `No ${label.toLowerCase()}`}
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void choose(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={busy}
            onClick={() => inputRef.current?.click()}
          >
            <ImageUp /> {currentUrl ? 'Replace' : 'Upload'}
          </Button>
          {currentUrl && onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onRemove()
                } catch (error) {
                  toast.error(errorMessage(error))
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Trash2 /> Remove
            </Button>
          )}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        JPEG, PNG or WebP up to 5 MB. Images are resized and metadata (such as location) is removed.
      </p>
    </div>
  )
}
