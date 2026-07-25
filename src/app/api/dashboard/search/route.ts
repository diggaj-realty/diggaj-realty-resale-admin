import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR } from '@/lib/format'

/** Global search for the internal dashboard's TopNav search box. Session-based
 *  (getServerSession), not the bearer-token /api/v1 surface used by the
 *  external buyer/seller apps — this only ever runs from within the dashboard
 *  itself, scoped to what the signed-in staff role is allowed to see. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role, id } = session.user
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ properties: [], users: [] })

  const propertyWhere = {
    ...(role === 'AGENT' ? { agentId: id } : {}),
    OR: [
      { title: { contains: q, mode: 'insensitive' as const } },
      { location: { contains: q, mode: 'insensitive' as const } },
      { city: { contains: q, mode: 'insensitive' as const } },
    ],
  }

  const properties = await prisma.property.findMany({
    where: propertyWhere,
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: { id: true, title: true, location: true, askingPrice: true, status: true },
  })

  const users =
    role === 'ADMIN' || role === 'BACKEND'
      ? await prisma.user.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, name: true, email: true, role: true },
        })
      : []

  return NextResponse.json({
    properties: properties.map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: `${p.location} · ${formatINR(p.askingPrice)}`,
      status: p.status,
      href: `/dashboard/listings/${p.id}`,
    })),
    users: users.map((u) => ({
      id: u.id,
      title: u.name,
      subtitle: u.email,
      status: u.role,
      href: `/dashboard/users?q=${encodeURIComponent(u.email)}`,
    })),
  })
}
