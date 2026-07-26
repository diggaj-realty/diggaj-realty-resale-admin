import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { formatINR, formatRelativeTime } from '@/lib/format'
import PageHeader from '@/components/dashboard/PageHeader'
import DashboardEntrance from '@/components/dashboard/DashboardEntrance'
import StatusPill from '@/components/dashboard/StatusPill'
import OfferStatusPill from '@/components/dashboard/OfferStatusPill'
import OfferTimeline from '@/components/dashboard/OfferTimeline'
import AssignDealAgentForm from '@/components/dashboard/AssignDealAgentForm'
import DealDocuments from '@/components/dashboard/DealDocuments'
import DealLog from '@/components/dashboard/DealLog'
import DealPaymentForms from '@/components/dashboard/DealPaymentForms'
import OfflineNegotiationPanel from '@/components/dashboard/OfflineNegotiationPanel'
import PaymentRequestsPanel from '@/components/dashboard/PaymentRequestsPanel'
import { computeDealProgress } from '@/lib/data/dealProgress'
import { Building2, User2, CalendarCheck, ArrowLeft } from 'lucide-react'

/** The single operational page for a transaction after acceptance. Everything
 *  the internal team needs — property, parties, negotiation history, site visit,
 *  offline negotiation, documents, payments, closure — lives here so acceptance
 *  is a starting point rather than a dead end. */
export default async function AcceptedOfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const { id: userId, role } = session.user
  if (!['AGENT', 'BACKEND', 'ADMIN'].includes(role)) redirect('/dashboard')

  const { id } = await params

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      property: {
        include: {
          photos: { where: { mediaType: 'IMAGE' }, orderBy: { order: 'asc' }, select: { photoUrl: true } },
        },
      },
      buyer: { select: { id: true, name: true, email: true, phone: true } },
      seller: { select: { id: true, name: true, email: true, phone: true } },
      agent: { select: { id: true, name: true, email: true, phone: true } },
      documents: { orderBy: { createdAt: 'asc' } },
      logEntries: { orderBy: { createdAt: 'desc' } },
      siteVisit: true,
      offlineNegotiations: {
        orderBy: { createdAt: 'desc' },
        include: { recordedBy: { select: { name: true } } },
      },
      paymentRequests: {
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { name: true } } },
      },
    },
  })
  if (!deal) notFound()

  const isStaff = role === 'BACKEND' || role === 'ADMIN'
  const isAssignedAgent = role === 'AGENT' && deal.agentId === userId
  // An agent who isn't on this deal has no business reading the parties' contact
  // details, so this is a hard 404 rather than a read-only view.
  if (!isStaff && !isAssignedAgent) notFound()
  const canManage = isStaff || isAssignedAgent

  // The accepted offer behind this deal — the negotiation history that led here.
  const acceptedOffer = await prisma.offer.findFirst({
    where: { propertyId: deal.propertyId, buyerId: deal.buyerId, status: 'ACCEPTED' },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  })

  const agents = isStaff
    ? await prisma.user.findMany({
        where: { role: 'AGENT', isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : []

  const progress = computeDealProgress(deal)
  const p = deal.property

  return (
    <DashboardEntrance>
      <Link
        href="/dashboard/accepted-offers"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold"
        style={{ color: 'var(--accent-700)' }}
      >
        <ArrowLeft size={13} /> Back to Accepted Offers
      </Link>

      <PageHeader
        title={p.title}
        subtitle={`${p.location} · Accepted ${formatRelativeTime(deal.createdAt)} · ${progress.label}`}
      />

      {/* ── Headline numbers ── */}
      <div className="card mb-6 p-6" data-animate="fade-up">
        <div className="flex flex-wrap items-center gap-6">
          <Metric label="Agreed price" value={formatINR(deal.agreedPrice)} accent />
          {acceptedOffer && <Metric label="Original offer" value={formatINR(acceptedOffer.amount)} />}
          {acceptedOffer?.counterAmount != null && (
            <Metric label="Final counter" value={formatINR(acceptedOffer.counterAmount)} />
          )}
          {deal.offlineNegotiations[0] && (
            <Metric label="Offline agreed" value={formatINR(deal.offlineNegotiations[0].agreedAmount)} />
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <StatusPill status={deal.status} />
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}
            >
              {progress.label}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Section A: Property ── */}
        <section className="card p-6" data-animate="fade-up">
          <h3 className="mb-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
            <Building2 size={15} /> Property
          </h3>
          {p.photos.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {p.photos.slice(0, 4).map((photo, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={photo.photoUrl}
                  alt=""
                  className="h-20 w-28 flex-shrink-0 rounded-lg object-cover"
                />
              ))}
            </div>
          )}
          <dl className="flex flex-col gap-1.5 text-xs">
            <Row label="Property ID" value={p.id} mono />
            <Row label="Type" value={p.type} />
            <Row label="Status" value={p.status} />
            <Row label="Plan" value={p.plan} />
            <Row label="Location" value={p.location} />
            <Row label="City / Locality" value={[p.city, p.locality].filter(Boolean).join(' · ') || '—'} />
            <Row label="Pincode" value={p.pincode ?? '—'} />
            <Row label="Area" value={`${p.areaSqft} sqft`} />
            <Row label="Configuration" value={[p.bhk ? `${p.bhk} BHK` : null, p.bathrooms ? `${p.bathrooms} bath` : null].filter(Boolean).join(' · ') || '—'} />
            <Row label="Asking price" value={formatINR(p.askingPrice)} />
            {p.amenities.length > 0 && <Row label="Amenities" value={p.amenities.join(', ')} />}
          </dl>
          {p.description && (
            <p className="mt-3 text-xs" style={{ color: 'var(--text-2)' }}>{p.description}</p>
          )}
          <Link
            href={`/dashboard/listings/${p.id}`}
            className="mt-3 inline-block text-xs font-semibold"
            style={{ color: 'var(--accent-700)' }}
          >
            Open full listing →
          </Link>
        </section>

        {/* ── Section B: Parties ── */}
        <section className="card p-6" data-animate="fade-up">
          <h3 className="mb-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
            <User2 size={15} /> Parties
          </h3>

          <Party title="Buyer" name={deal.buyer.name} email={deal.buyer.email} phone={deal.buyer.phone} id={deal.buyer.id} />
          <Party title="Seller" name={deal.seller.name} email={deal.seller.email} phone={deal.seller.phone} id={deal.seller.id} />
          <Party
            title="Assigned agent"
            name={deal.agent?.name ?? 'Not assigned'}
            email={deal.agent?.email ?? null}
            phone={deal.agent?.phone ?? null}
            id={deal.agent?.id ?? null}
          />

          {isStaff && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <p className="mb-2 text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
                {deal.agentId ? 'Reassign agent' : 'Assign an agent to start operational work'}
              </p>
              <AssignDealAgentForm dealId={deal.id} agentId={deal.agentId} agents={agents} />
            </div>
          )}
        </section>

        {/* ── Section C: Offer & negotiation ── */}
        <section className="card p-6" data-animate="fade-up">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Offer & Negotiation</h3>
            {acceptedOffer && <OfferStatusPill status={acceptedOffer.status} />}
          </div>
          {acceptedOffer ? (
            <>
              <dl className="mb-4 flex flex-col gap-1.5 text-xs">
                <Row label="Original offer" value={formatINR(acceptedOffer.amount)} />
                <Row label="Final counter" value={acceptedOffer.counterAmount != null ? formatINR(acceptedOffer.counterAmount) : '—'} />
                <Row label="Countered by" value={acceptedOffer.counterBy ?? '—'} />
                <Row label="Accepted amount" value={formatINR(deal.agreedPrice)} />
                <Row label="Offer created" value={acceptedOffer.createdAt.toLocaleString('en-IN')} />
                <Row label="Accepted at" value={deal.createdAt.toLocaleString('en-IN')} />
                {acceptedOffer.message && <Row label="Buyer note" value={acceptedOffer.message} />}
              </dl>
              <OfferTimeline events={acceptedOffer.events} />
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              No platform offer is linked to this deal — it was created directly from a site visit, so the
              agreement was reached in person rather than through online negotiation.
            </p>
          )}
        </section>

        {/* ── Section D: Site visit ── */}
        <section className="card p-6" data-animate="fade-up">
          <h3 className="mb-4 flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
            <CalendarCheck size={15} /> Site Visit
          </h3>
          {deal.siteVisit ? (
            <dl className="flex flex-col gap-1.5 text-xs">
              <Row label="Status" value={deal.siteVisit.status} />
              <Row label="Outcome" value={deal.siteVisit.outcome ?? 'Not recorded'} />
              <Row label="Requested" value={deal.siteVisit.requestedDate.toLocaleString('en-IN')} />
              <Row
                label="Scheduled"
                value={deal.siteVisit.scheduledDate ? deal.siteVisit.scheduledDate.toLocaleString('en-IN') : '—'}
              />
              {deal.siteVisit.interestedAmount != null && (
                <Row label="Interested at" value={formatINR(deal.siteVisit.interestedAmount)} />
              )}
              {deal.siteVisit.buyerNote && <Row label="Buyer note" value={deal.siteVisit.buyerNote} />}
              {deal.siteVisit.feedback && <Row label="Agent feedback" value={deal.siteVisit.feedback} />}
            </dl>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              No site visit is linked to this deal.{' '}
              <Link href="/dashboard/site-visits-queue" className="font-semibold" style={{ color: 'var(--accent-700)' }}>
                Open the site-visit queue →
              </Link>
            </p>
          )}
        </section>
      </div>

      {/* ── Section E: Offline negotiation ── */}
      <div className="mt-6">
        <OfflineNegotiationPanel
          dealId={deal.id}
          canRecord={canManage}
          records={deal.offlineNegotiations.map((n) => ({
            id: n.id,
            agreedAmount: n.agreedAmount,
            buyerConfirmed: n.buyerConfirmed,
            sellerConfirmed: n.sellerConfirmed,
            notes: n.notes,
            recordedByName: n.recordedBy.name,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
      </div>

      {/* ── Section F: Documents ── */}
      <div className="mt-6">
        <DealDocuments
          dealId={deal.id}
          canManage={canManage}
          documents={deal.documents.map((d) => ({
            id: d.id,
            docType: d.docType,
            requiredFrom: d.requiredFrom,
            status: d.status,
            fileUrl: d.fileUrl,
            remarks: d.remarks,
          }))}
        />
      </div>

      {/* ── Section G: Payments ── */}
      <div className="mt-6">
        <PaymentRequestsPanel
          dealId={deal.id}
          canManage={canManage}
          requests={deal.paymentRequests.map((r) => ({
            id: r.id,
            recipient: r.recipient,
            amount: r.amount,
            title: r.title,
            description: r.description,
            dueDate: r.dueDate ? r.dueDate.toISOString() : null,
            status: r.status,
            paidAt: r.paidAt ? r.paidAt.toISOString() : null,
            paymentRef: r.paymentRef,
            createdByName: r.createdBy.name,
            createdAt: r.createdAt.toISOString(),
          }))}
        />
      </div>

      {/* ── Section H: Recorded payments & closure ── */}
      {canManage && deal.status !== 'CLOSED' && (
        <div className="mt-6">
          <DealPaymentForms
            dealId={deal.id}
            tokenAmount={deal.tokenAmount}
            tokenDate={deal.tokenDate}
            finalAmount={deal.finalAmount}
            finalPaymentDate={deal.finalPaymentDate}
            paymentMode={deal.paymentMode}
            transactionRef={deal.transactionRef}
            notes={deal.notes}
            canClose={!!deal.finalPaymentDate}
          />
        </div>
      )}

      {/* ── Progress log ── */}
      <div className="mt-6">
        <DealLog
          dealId={deal.id}
          canPost={canManage}
          entries={deal.logEntries.map((e) => ({
            id: e.id,
            message: e.message,
            authorRole: e.authorRole,
            createdAt: e.createdAt.toISOString(),
          }))}
        />
      </div>
    </DashboardEntrance>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</p>
      <p
        className="text-lg font-bold"
        style={{ color: accent ? 'var(--accent-700)' : 'var(--text-1)' }}
      >
        {value}
      </p>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd
        className={`text-right font-medium ${mono ? 'font-mono text-[11px]' : ''}`}
        style={{ color: 'var(--text-1)' }}
      >
        {value}
      </dd>
    </div>
  )
}

function Party({
  title,
  name,
  email,
  phone,
  id,
}: {
  title: string
  name: string
  email: string | null
  phone: string | null
  id: string | null
}) {
  return (
    <div className="mb-3 rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{title}</p>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{name}</p>
      {email && <p className="text-xs" style={{ color: 'var(--text-2)' }}>{email}</p>}
      {phone && <p className="text-xs" style={{ color: 'var(--text-2)' }}>{phone}</p>}
      {id && <p className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{id}</p>}
    </div>
  )
}
