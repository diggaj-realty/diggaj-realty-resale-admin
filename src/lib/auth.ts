import type { AuthOptions, Session } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { notifyUsers } from '@/lib/notify'
import type { UserRole } from '@/types'

/** Same staff-only gate the credentials provider's authorize() enforces,
 *  reused for Google sign-in so both paths land on identical rules: PENDING
 *  (awaiting admin role assignment), deactivated, and BUYER/SELLER (public-app
 *  roles, never this dashboard) all get turned away with a distinct reason. */
function staffGateError(user: { role: string; isActive: boolean }): string | null {
  if (user.role === 'PENDING') return 'PendingApproval'
  if (!user.isActive) return 'Deactivated'
  if (user.role === 'BUYER' || user.role === 'SELLER') return 'StaffOnly'
  return null
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) return null

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!isValid) return null

        if (user.role === 'PENDING') {
          throw new Error('Your signup is awaiting admin approval. Try again once approved.')
        }
        if (!user.isActive) throw new Error('This account has been deactivated.')

        if (user.role === 'BUYER' || user.role === 'SELLER') {
          throw new Error('This dashboard is for internal staff only. Please use the Diggaj Realty app to sign in.')
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as UserRole,
        }
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return true // credentials already fully validated in authorize()
      if (!user.email) return '/login?error=NoEmail'

      let dbUser = await prisma.user.findUnique({ where: { email: user.email } })

      if (!dbUser) {
        // First time this Google account has signed in here — mirrors requestStaffSignup:
        // no self-assigned role, sits PENDING until an ADMIN assigns one via /dashboard/users.
        dbUser = await prisma.user.create({
          data: {
            name: user.name || user.email.split('@')[0],
            email: user.email,
            passwordHash: await bcrypt.hash(crypto.randomUUID(), 10), // Google-only account — never used to log in
            role: 'PENDING',
            roles: [],
            isActive: false,
            avatarUrl: user.image ?? null,
          },
        })

        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
        await notifyUsers(
          admins.map((a) => ({
            userId: a.id,
            title: 'New signup awaiting approval',
            message: `${dbUser!.name} (${dbUser!.email}) signed up with Google and needs a role assigned.`,
          }))
        )
      }

      const gateError = staffGateError(dbUser)
      return gateError ? `/login?error=${gateError}` : true
    },
    async jwt({ token, user, account }) {
      if (account?.provider === 'google' && user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } })
        if (dbUser) {
          token.id = dbUser.id
          token.role = dbUser.role as UserRole
          token.name = dbUser.name
          token.email = dbUser.email
        }
      } else if (user) {
        token.id = user.id
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }): Promise<Session> {
      if (token) {
        ;(session.user as any).id = token.id as string
        ;(session.user as any).role = token.role as UserRole
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
}
