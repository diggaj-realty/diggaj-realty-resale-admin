import { ShieldAlert, ShieldCheck } from 'lucide-react'

export default function KycBanner({ rejected, remarks }: { rejected: boolean; remarks: string | null }) {
  return (
    <div
      className="mb-6 flex items-center gap-4 rounded-2xl border px-5 py-4"
      style={{
        background: rejected ? 'var(--red-50)' : 'var(--amber-50)',
        borderColor: rejected ? 'rgba(185,28,28,0.15)' : 'rgba(180,83,9,0.15)',
      }}
      data-animate="fade-up"
    >
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
        style={{ background: rejected ? 'var(--red-500)' : 'var(--amber-500)', color: '#fff' }}
      >
        {rejected ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
      </span>
      <div>
        <p className="text-sm font-bold" style={{ color: rejected ? 'var(--red-700)' : 'var(--amber-700)' }}>
          {rejected ? 'KYC Rejected' : 'KYC Verification Required'}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>
          {rejected
            ? `Reason: ${remarks ?? 'No reason provided'}. Please resubmit your documents.`
            : 'Complete your KYC verification before you can list a property.'}
        </p>
      </div>
    </div>
  )
}
