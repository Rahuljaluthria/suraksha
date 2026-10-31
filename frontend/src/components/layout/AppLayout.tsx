import { Outlet } from "react-router-dom"
import { ShieldCheck } from "lucide-react"

export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar px-4">
        <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
        <span className="text-sm font-semibold tracking-tight">Suraksha</span>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
