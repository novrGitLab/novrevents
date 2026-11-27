import Link from 'next/link'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Wordmark />
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground max-w-md">
        The page you’re looking for doesn’t exist or has moved.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/events">Explore events</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  )
}
