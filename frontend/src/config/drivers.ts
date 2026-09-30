import type { DriverProfile } from "../api/types"

export const DRIVER_PROFILES: DriverProfile[] = [
  {
    id: "j-carter",
    driverName: "James Carter",
    carrierName: "Summit Freight Lines",
    mainOfficeAddress: "4400 Gateway Blvd, Springfield, IL 62704",
    homeTerminalAddress: "4400 Gateway Blvd, Springfield, IL 62704",
    truckTractorNumber: "TRK-2231",
    trailerNumbers: "TRL-8817",
  },
  {
    id: "m-alvarez",
    driverName: "Maria Alvarez",
    carrierName: "Blue Horizon Trucking Co.",
    mainOfficeAddress: "1200 Harbor Dr, Portland, OR 97201",
    homeTerminalAddress: "88 Depot St, Salem, OR 97301",
    truckTractorNumber: "TRK-5502",
    trailerNumbers: "TRL-1190 / TRL-1191",
  },
  {
    id: "d-owusu",
    driverName: "Daniel Owusu",
    carrierName: "Ironclad Logistics",
    mainOfficeAddress: "77 Commerce Pkwy, Charlotte, NC 28202",
    homeTerminalAddress: "77 Commerce Pkwy, Charlotte, NC 28202",
    truckTractorNumber: "TRK-9043",
    trailerNumbers: "TRL-4460",
  },
]

export const DEFAULT_DRIVER_ID = DRIVER_PROFILES[0].id

export function getDriverProfile(id: string): DriverProfile {
  return DRIVER_PROFILES.find((d) => d.id === id) ?? DRIVER_PROFILES[0]
}
