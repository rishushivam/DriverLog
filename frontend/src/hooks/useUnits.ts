import { createContext, useContext } from "react"
import type { Units } from "../model/format"

export const UnitsContext = createContext<{ units: Units; setUnits: (u: Units) => void }>({ units: "mi", setUnits: () => {} })
export const useUnits = () => useContext(UnitsContext)

/** Default by locale: miles for US/UK/Liberia/Myanmar, kilometres elsewhere. */
export function defaultUnits(): Units {
  const lang = typeof navigator !== "undefined" ? navigator.language : "en-US"
  const region = lang.split("-")[1]?.toUpperCase()
  return !region || ["US", "GB", "LR", "MM"].includes(region) ? "mi" : "km"
}
