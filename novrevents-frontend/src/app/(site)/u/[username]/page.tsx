'use client'

import { useQuery } from '@tanstack/react-query'
import { AtSign, Code2, Download, Globe, Lock, QrCode, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import * as React from 'react'
import { Pagination } from '@/components/common'
import { EventCard } from '@/components/events/event-card'
import { FollowButton, PeopleList } from '@/components/profiles/people'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const profile = useQuery({
    queryKey: keys.profile(username),
    queryFn: () => unwrap(api.GET('/api/v1/profiles/{username}', { params: { path: { username } } })),
  })

  if (profile.isPending)
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <LoadingState rows={3} />
      </div>
    )
  if (profile.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        {isApiError(profile.error) && profile.error.status === 404 ? (
          <>
            <h1 className="text-2xl font-semibold">Profile not available</h1>
            <p className="text-muted-foreground mt-2">This profile does not exist or is private.</p>
          </>
        ) : (
          <ErrorState error={profile.error} retry={() => void profile.refetch()} />
        )}
      </div>
    )
  }
  const data = profile.data
  const links = data.socialLinks

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar src={data.avatarUrl} name={data.displayName} className="size-20 text-lg" />
          <div className="min-w-0 flex-1">
            <h1 className="page-title">{data.displayName}</h1>
            <p className="text-muted-foreground text-sm">@{data.username}</p>
            {data.headline && <p className="mt-3 text-[15px] font-medium">{data.headline}</p>}
            {data.bio && (
              <p className="text-muted-foreground mt-1.5 max-w-xl text-sm whitespace-pre-line">{data.bio}</p>
            )}
            <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              <span>
                <strong className="text-foreground tabular-nums">{data.followerCount}</strong> followers
              </span>
              <span>
                <strong className="text-foreground tabular-nums">{data.followingCount}</strong> following
              </span>
              <span>
                <strong className="text-foreground tabular-nums">{data.organizedEventCount}</strong> events
                organised
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {data.isSelf ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/profile">Edit profile</Link>
                </Button>
              ) : (
                <FollowButton username={data.username} following={data.isFollowing} />
              )}
              {links?.website && <SocialLink href={links.website} icon={Globe} label="Website" />}
              {links?.linkedin && <SocialLink href={links.linkedin} icon={UserRound} label="LinkedIn" />}
              {links?.github && <SocialLink href={links.github} icon={Code2} label="GitHub" />}
              {links?.x && <SocialLink href={links.x} icon={AtSign} label="X" />}
              <span className="lg:hidden">
                <ProfileQr username={data.username} />
              </span>
            </div>
          </div>
        </section>

        <IdentityCard username={data.username} displayName={data.displayName} headline={data.headline} />
      </div>

      <Tabs defaultValue="events" className="mt-10">
        <TabsList>
          <TabsTrigger value="events">Events organised</TabsTrigger>
          <TabsTrigger value="attending">Attending</TabsTrigger>
          <TabsTrigger value="followers">Followers</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
        </TabsList>
        <TabsContent value="events">
          <ProfileEvents username={data.username} list="events" />
        </TabsContent>
        <TabsContent value="attending">
          <ProfileEvents username={data.username} list="registered-events" />
        </TabsContent>
        <TabsContent value="followers">
          <PeopleList username={data.username} list="followers" />
        </TabsContent>
        <TabsContent value="following">
          <PeopleList username={data.username} list="following" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** A shareable digital identity card: the profile QR, always black on white. */
function IdentityCard({
  username,
  displayName,
  headline,
}: {
  username: string
  displayName: string
  headline: string | null
}) {
  return (
    <aside
      aria-label="Profile QR code"
      className="bg-card hidden self-start overflow-hidden rounded-lg border lg:block"
    >
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-[13px] font-semibold">
          NOVR <span className="font-normal">Events</span>
        </span>
        <span className="text-muted-foreground text-[11px]">Profile card</span>
      </div>
      <div className="flex flex-col items-center px-5 pt-5 pb-4 text-center">
        <img
          src={`/api/v1/profiles/${username}/qr?format=svg`}
          alt={`QR code linking to @${username}`}
          className="size-40 rounded-md border bg-white p-2"
        />
        <p className="mt-3 text-sm font-semibold">{displayName}</p>
        {headline && <p className="text-muted-foreground text-[13px]">{headline}</p>}
        <p className="text-subtle-foreground mt-1 text-xs">Scan to open @{username}. Not an event ticket.</p>
      </div>
      <div className="border-t p-2">
        <Button asChild variant="ghost" size="sm" className="w-full">
          <a href={`/api/v1/profiles/${username}/qr?format=png`} download={`${username}-profile-qr.png`}>
            <Download /> Download PNG
          </a>
        </Button>
      </div>
    </aside>
  )
}

function SocialLink({ href, icon: Icon, label }: { href: string; icon: typeof Globe; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow me"
      className="text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium"
    >
      <Icon className="size-4" aria-hidden /> {label}
    </a>
  )
}

function ProfileQr({ username }: { username: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Show profile QR code"
        onClick={() => setOpen(true)}
      >
        <QrCode />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Profile QR code</DialogTitle>
            <DialogDescription>
              Scan to open @{username}’s profile. This is not an event ticket.
            </DialogDescription>
          </DialogHeader>
          <img
            src={`/api/v1/profiles/${username}/qr?format=svg`}
            alt={`QR code linking to @${username}`}
            className="mx-auto size-64 rounded-lg border bg-white p-2"
          />
          <Button asChild variant="outline">
            <a href={`/api/v1/profiles/${username}/qr?format=png`} download={`${username}-profile-qr.png`}>
              Download PNG
            </a>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ProfileEvents({ username, list }: { username: string; list: 'events' | 'registered-events' }) {
  const [page, setPage] = React.useState(1)
  const query = useQuery({
    queryKey: keys.profileList(username, list, { page }),
    queryFn: () =>
      list === 'events'
        ? unwrap(
            api.GET('/api/v1/profiles/{username}/events', {
              params: { path: { username }, query: { page, pageSize: 12 } },
            }),
          ).then((data) => ({ ...data, visible: true }))
        : unwrap(
            api.GET('/api/v1/profiles/{username}/registered-events', {
              params: { path: { username }, query: { page, pageSize: 12 } },
            }),
          ),
  })
  if (query.isPending) return <LoadingState rows={2} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  if (!query.data.visible) {
    return (
      <EmptyState
        icon={Lock}
        title="Registrations are private"
        description="This person has not chosen to share the events they attend, or shares them with followers only."
      />
    )
  }
  if (query.data.items.length === 0)
    return <EmptyState title={list === 'events' ? 'No public events yet' : 'No shared registrations'} />
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {query.data.items.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
      <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />
    </>
  )
}
