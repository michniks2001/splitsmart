import ReceiptUploader from '@/components/ReceiptUploader'
import SessionView from '@/components/SessionView'
import QRDisplay from '@/components/QRDisplay'
import HostNameEditor from '@/components/HostNameEditor'

export default async function SessionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-transparent dark:from-zinc-950/40 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">SplitSmart Session</h1>
            <div className="inline-flex items-center gap-2 text-sm text-gray-600">
              <span className="px-2 py-1 rounded-md border bg-white/70 dark:bg-zinc-900/50">Code: <span className="font-mono font-medium">{code}</span></span>
              <span className="hidden sm:inline">Share this code or scan the QR to join</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <HostNameEditor sessionCode={code} />
            <QRDisplay value={`/s/${code}`} />
          </div>
        </div>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-gray-600">Upload receipt</h2>
            <ReceiptUploader sessionCode={code} />
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-medium text-gray-600">Claim items</h2>
            <SessionView sessionCode={code} />
          </div>
        </section>
      </div>
    </main>
  )
}
