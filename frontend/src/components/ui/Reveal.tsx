import { AnimatePresence, motion } from "framer-motion"
import type { ReactNode } from "react"
import { reveal } from "./motion"

/** Progressive disclosure wrapper: animates height + fade on mount/unmount. */
export function Reveal({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div id={id} key="reveal" variants={reveal} initial="collapsed" animate="open" exit="collapsed">
          <div className="pt-3">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
