import Link from 'next/link'

export const metadata = { title: 'You are offline | Thretha Couture', robots: { index: false, follow: false } }

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#fbfaf7] px-6 text-[#24221f]">
      <section className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.3em]">Thretha Couture</p>
        <h1 className="mt-4 font-serif text-4xl">You’re offline</h1>
        <p className="mt-3 text-sm leading-6 text-[#706b64]">Reconnect to browse current products, check order details, or complete checkout. Payment and order information is never shown from an offline cache.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center bg-[#24221f] px-5 text-xs uppercase tracking-wider text-white">Try again</Link>
      </section>
    </main>
  )
}
