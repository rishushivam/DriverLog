import { motion } from "framer-motion"
import { Moon, Sun } from "lucide-react"
import type { Theme } from "../../hooks/useTheme"
import { press } from "./motion"

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const dark = theme === "dark"
  return (
    <motion.button
      type="button"
      whileTap={press}
      onClick={onToggle}
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      className="focus-ring relative flex h-8 w-14 items-center rounded-full border border-line bg-surface-2 px-1"
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.25)] ${dark ? "ml-auto" : ""}`}
      >
        {dark ? <Moon size={13} strokeWidth={2.25} className="text-accent" /> : <Sun size={13} strokeWidth={2.25} className="text-accent-600" />}
      </motion.span>
    </motion.button>
  )
}
