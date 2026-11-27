'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from '@/components/ui/icons'
import Link from 'next/link'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CopyField, Field, fieldAria, PageHeader } from '@/components/common'
import { ImageUpload } from '@/components/image-upload'
import { ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { api, unwrap, type Schema } from '@/lib/api/client'
import type { paths } from '@/lib/api/schema'
import { applyFieldErrors, errorMessage, hasCode } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'

type OwnProfile = Schema<'OwnProfile'>
type ProfilePatch = NonNullable<
  paths['/api/v1/profiles/me']['patch']['requestBody']
>['content']['application/json']
const PUBLIC_FIELDS = [
  { key: 'avatar', label: 'Profile photo' },
  { key: 'headline', label: 'Headline' },
  { key: 'bio', label: 'Bio' },
  { key: 'socialLinks', label: 'Social links' },
] as const

const url = z.union([z.literal(''), z.url('Enter a full URL starting with https://')])
const schema = z.object({
  displayName: z.string().trim().min(2).max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/, 'Use 3–30 letters, numbers, hyphens or underscores.'),
  headline: z.string().max(120),
  bio: z.string().max(600),
  website: url,
  linkedin: url,
  github: url,
  x: url,
})
type Values = z.infer<typeof schema>

export default function ProfileSettingsPage() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: keys.ownProfile, queryFn: () => unwrap(api.GET('/api/v1/profiles/me')) })

  const save = async (patch: ProfilePatch) => {
    const updated = await unwrap(api.PATCH('/api/v1/profiles/me', { body: patch }))
    queryClient.setQueryData(keys.ownProfile, updated)
    await queryClient.invalidateQueries({ queryKey: keys.session })
    await queryClient.invalidateQueries({ queryKey: ['profile'] })
    return updated
  }

  if (query.isPending) return <LoadingState rows={4} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const profile = query.data

  return (
    <>
      <PageHeader
        title="Profile"
        description="A simple public profile so attendees and organisers can find you."
        actions={
          <Button asChild variant="outline">
            <Link href={`/u/${profile.username}`}>
              View public profile <ExternalLink />
            </Link>
          </Button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>Photo</CardTitle>
              <CardDescription>Square images work best. Shown on your profile and to organisers.</CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <ImageUpload<OwnProfile>
                label="Profile photo"
                currentUrl={profile.avatarUrl}
                endpoint="/api/v1/profiles/me/avatar"
                onUploaded={(updated) => queryClient.setQueryData(keys.ownProfile, updated)}
                onRemove={async () => {
                  queryClient.setQueryData(
                    keys.ownProfile,
                    await unwrap(api.DELETE('/api/v1/profiles/me/avatar')),
                  )
                }}
              />
            </CardContent>
          </Card>
          <DetailsForm profile={profile} onSave={save} />
        </div>
        <aside className="space-y-6 lg:sticky lg:top-20" aria-label="Visibility and sharing">
          <PrivacyCard profile={profile} onSave={save} />
          <PublicPreviewCard username={profile.username} isPrivate={profile.visibility === 'PRIVATE'} />
          <QrCard profile={profile} />
        </aside>
      </div>
    </>
  )
}

function DetailsForm({
  profile,
  onSave,
}: {
  profile: OwnProfile
  onSave: (patch: ProfilePatch) => Promise<OwnProfile>
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: profile.displayName,
      username: profile.username,
      headline: profile.headline ?? '',
      bio: profile.bio ?? '',
      website: profile.socialLinks.website ?? '',
      linkedin: profile.socialLinks.linkedin ?? '',
      github: profile.socialLinks.github ?? '',
      x: profile.socialLinks.x ?? '',
    },
  })
  const { errors, isSubmitting, isDirty } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await onSave({
        displayName: values.displayName,
        username: values.username,
        headline: values.headline,
        bio: values.bio,
        socialLinks: {
          website: values.website,
          linkedin: values.linkedin,
          github: values.github,
          x: values.x,
        },
      })
      form.reset(values)
      toast.success('Profile saved')
    } catch (error) {
      if (hasCode(error, 'USERNAME_TAKEN')) form.setError('username', { message: errorMessage(error) })
      else if (!applyFieldErrors(error, form.setError, ['body.', 'body.socialLinks.']))
        toast.error(errorMessage(error))
    }
  })

  const text = (
    name: keyof Values,
    label: string,
    extra: { description?: string; type?: string; placeholder?: string } = {},
  ) => (
    <Field label={label} htmlFor={name} description={extra.description} error={errors[name]?.message}>
      <Input
        {...fieldAria(name, errors[name]?.message, Boolean(extra.description))}
        type={extra.type}
        placeholder={extra.placeholder}
        {...form.register(name)}
      />
    </Field>
  )

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader className="border-b pb-4">
          <CardTitle>Details</CardTitle>
          <CardDescription>Your name and username are always public when your profile is public.</CardDescription>
        </CardHeader>
        <div className="space-y-4 p-5">
          <h3 className="eyebrow">About you</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('displayName', 'Name')}
            {text('username', 'Username', { description: 'Changing it changes your profile address.' })}
          </div>
          {text('headline', 'Headline', { placeholder: 'e.g. Detection engineer at …' })}
          <Field label="Short bio" htmlFor="bio" description="Up to 600 characters." error={errors.bio?.message}>
            <Textarea
              {...fieldAria('bio', errors.bio?.message, true)}
              maxLength={600}
              {...form.register('bio')}
            />
          </Field>
        </div>
        <div className="space-y-4 border-t p-5">
          <h3 className="eyebrow">Links</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('website', 'Website', { type: 'url', placeholder: 'https://' })}
            {text('linkedin', 'LinkedIn', { type: 'url', placeholder: 'https://www.linkedin.com/in/…' })}
            {text('github', 'GitHub', { type: 'url', placeholder: 'https://github.com/…' })}
            {text('x', 'X', { type: 'url', placeholder: 'https://x.com/…' })}
          </div>
        </div>
        <CardFooter className="justify-between">
          <p className="text-muted-foreground text-[13px]">{isDirty ? 'You have unsaved changes.' : 'All changes saved.'}</p>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            Save profile
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

/**
 * What visitors see right now. It is the same public endpoint visitors use, so it reflects the field-level
 * privacy choices exactly; nothing is shown that the public could not see.
 */
function PublicPreviewCard({ username, isPrivate }: { username: string; isPrivate: boolean }) {
  const preview = useQuery({
    queryKey: keys.profile(username),
    queryFn: () => unwrap(api.GET('/api/v1/profiles/{username}', { params: { path: { username } } })),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Public preview</CardTitle>
        <CardDescription>This is what visitors see on your profile.</CardDescription>
      </CardHeader>
      <CardContent>
        {isPrivate ? (
          <p className="text-muted-foreground text-sm">
            Your profile is private, so visitors see a “not available” page. Make it public in Privacy to show
            your details.
          </p>
        ) : preview.isPending ? (
          <LoadingState rows={2} />
        ) : preview.isError ? (
          <ErrorState error={preview.error} retry={() => void preview.refetch()} />
        ) : (
          <div className="space-y-2 rounded-sm border p-3 text-sm">
            <p className="font-medium">{preview.data.displayName}</p>
            <p className="text-muted-foreground">@{preview.data.username}</p>
            {preview.data.headline && <p>{preview.data.headline}</p>}
            {preview.data.bio && (
              <p className="text-muted-foreground whitespace-pre-line">{preview.data.bio}</p>
            )}
            {!preview.data.headline && !preview.data.bio && (
              <p className="text-muted-foreground text-[13px]">
                Nothing else is public yet. Turn on the fields you want to share in Privacy.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PrivacyCard({
  profile,
  onSave,
}: {
  profile: OwnProfile
  onSave: (patch: ProfilePatch) => Promise<OwnProfile>
}) {
  const [busy, setBusy] = React.useState(false)
  const update = async (patch: ProfilePatch) => {
    setBusy(true)
    try {
      await onSave(patch)
      toast.success('Privacy settings saved')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Visibility</CardTitle>
        <CardDescription>Your email address is never shown on your profile.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <label htmlFor="visibility" className="text-sm font-medium">
              Public profile
            </label>
            <p className="text-muted-foreground text-xs">When off, only you can see your profile.</p>
          </div>
          <Switch
            id="visibility"
            checked={profile.visibility === 'PUBLIC'}
            disabled={busy}
            onCheckedChange={(checked) => void update({ visibility: checked ? 'PUBLIC' : 'PRIVATE' })}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Show on my public profile</legend>
          {PUBLIC_FIELDS.map((field) => (
            <label key={field.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                disabled={busy}
                checked={profile.publicFields.includes(field.key)}
                onChange={(event) =>
                  void update({
                    publicFields: event.target.checked
                      ? [...profile.publicFields, field.key]
                      : profile.publicFields.filter((key) => key !== field.key),
                  })
                }
              />
              {field.label}
            </label>
          ))}
        </fieldset>
        <div className="flex items-start justify-between gap-3 border-t pt-4">
          <div>
            <label htmlFor="share" className="text-sm font-medium">
              Share events I’m attending
            </label>
            <p className="text-muted-foreground text-xs">
              Off by default. When on, your followers see confirmed registrations for public events only.
            </p>
          </div>
          <Switch
            id="share"
            checked={profile.shareRegistrations}
            disabled={busy}
            onCheckedChange={(checked) => void update({ shareRegistrations: checked })}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function QrCard({ profile }: { profile: OwnProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile QR code</CardTitle>
        <CardDescription>Share your profile at events. This is separate from event tickets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.visibility === 'PUBLIC' ? (
          <>
            <img
              src={`/api/v1/profiles/${profile.username}/qr?format=svg`}
              alt="QR code for your public profile"
              className="mx-auto size-40 rounded-lg border bg-white p-2"
            />
            <CopyField label="Profile link" value={profile.profileUrl} />
            <Button asChild variant="outline" size="sm" className="w-full">
              <a
                href={`/api/v1/profiles/${profile.username}/qr?format=png`}
                download={`${profile.username}-profile-qr.png`}
              >
                Download PNG
              </a>
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Make your profile public to share it with a QR code.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
