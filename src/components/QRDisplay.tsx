'use client'

import QRCode from 'react-qr-code'

export default function QRDisplay({ value }: { value: string }) {
  return (
    <div className="rounded-xl border bg-white shadow-sm p-3 dark:bg-zinc-900 w-fit">
      <div className="bg-white rounded-md p-2">
        <QRCode value={value} size={160} bgColor="#ffffff" fgColor="#000000" />
      </div>
      <p className="text-xs text-gray-600 mt-2 text-center">Scan to join</p>
    </div>
  )
}
