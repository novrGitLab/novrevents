/**
 * TanStack Query keys. Grouped by resource so a mutation can invalidate everything it affects,
 * e.g. `queryClient.invalidateQueries({ queryKey: keys.event(id) })` refreshes every event view.
 */
export const keys = {
  session: ['session'] as const,
  categories: ['categories'] as const,
  publicEvents: (params: object) => ['public-events', params] as const,
  publicEvent: (slug: string, key?: string | null) => ['public-event', slug, key ?? null] as const,
  publicForm: (slug: string) => ['public-form', slug] as const,
  profile: (username: string) => ['profile', username] as const,
  profileList: (username: string, list: string, params: object) =>
    ['profile', username, list, params] as const,
  ownProfile: ['own-profile'] as const,
  notifications: (params: object) => ['notifications', params] as const,
  myEvents: (params: object) => ['my-events', params] as const,
  myRegistrations: (params: object) => ['my-registrations', params] as const,
  savedEvents: (params: object) => ['saved-events', params] as const,
  feed: (params: object) => ['feed', params] as const,
  overview: ['organizer-overview'] as const,
  organizations: ['organizations'] as const,
  followedOrganizations: ['followed-organizations'] as const,
  organization: (id: string) => ['organization', id] as const,
  event: (id: string) => ['event', id] as const,
  eventPart: (id: string, part: string, params: object = {}) => ['event', id, part, params] as const,
  forms: (params: object) => ['forms', params] as const,
  form: (id: string) => ['form', id] as const,
  formPart: (id: string, part: string, params: object = {}) => ['form', id, part, params] as const,
  admin: (part: string, params: object = {}) => ['admin', part, params] as const,
}
