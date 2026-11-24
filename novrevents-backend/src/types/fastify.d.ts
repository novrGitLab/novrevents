import 'fastify'

/** The authenticated caller, resolved from the session cookie on every request. */
export interface AuthContext {
  userId: string
  sessionId: string
  email: string
  role: 'USER' | 'ADMIN'
  emailVerified: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Null for anonymous requests. Use `requireAuth(request)` in handlers that need a user. */
    auth: AuthContext | null
  }

  interface FastifyContextConfig {
    /** Set to false only for endpoints authenticated by something other than the session cookie. */
    csrf?: boolean
  }
}
