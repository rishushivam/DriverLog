import { Monitor, Moon, Sun } from "lucide-react"
import type { ThemePreference } from "../../hooks/useTheme"
import { SegmentedControl } from "./SegmentedControl"

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

/** Labeled three-way theme switch. Icons and text both name the choice,
 * and the active segment carries the accent fill. */
export function ThemeToggle({ preference, onChange, compact = false }: { preference: ThemePreference; onChange: (p: ThemePreference) => void; compact?: boolean }) {
  return (
    <SegmentedControl
      name="theme"
      aria-label="Theme"
      size="sm"
      value={preference}
      onChange={onChange}
      options={OPTIONS.map((o) => ({ value: o.value, label: o.label, icon: <o.icon size={13} strokeWidth={2.25} aria-hidden="true" />, hideLabel: compact }))}
    />
  )
}
