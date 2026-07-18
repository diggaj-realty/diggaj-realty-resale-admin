import { NextResponse } from 'next/server'

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status })
}

type RouteHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>

/** Wraps an App Router route handler: catches ApiError/unexpected errors into
 *  a consistent { error: { message } } envelope. CORS headers are applied
 *  globally by middleware.ts, not here. */
export function withApi(handler: RouteHandler) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: { message: err.message } }, { status: err.status })
      }
      console.error(err)
      return NextResponse.json({ error: { message: 'Internal server error' } }, { status: 500 })
    }
  }
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new ApiError('Request body must be valid JSON', 400)
  }
}

export function parsePagination(url: URL, defaultSize = 20, maxSize = 100) {
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get('page')) || 1))
  const pageSize = Math.min(maxSize, Math.max(1, Math.trunc(Number(url.searchParams.get('pageSize')) || defaultSize)))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

export function paginatedEnvelope<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}
