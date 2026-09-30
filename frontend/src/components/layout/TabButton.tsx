import type { ReactNode } from "react"

interface Props {
  active: boolean
  onClick: () => void
  children: ReactNode
}

export function TabButton({ active, onClick, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/40 active:scale-[0.97] ${
        active ? "bg-navy-600 text-white shadow-sm" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  )
}
