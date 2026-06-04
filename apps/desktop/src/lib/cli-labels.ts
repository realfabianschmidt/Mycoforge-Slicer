/**
 * Stable labels for every CLI command. Shared by the run helpers (logging +
 * toasts) and the panels (matching the active command for per-button spinners).
 */
export const CliLabel = {
  slicerStatus: "Slicer status",
  installOrca: "Install OrcaSlicer",
  setCustomSlicer: "Set custom slicer",
  resolveSlicer: "Resolve slicer",
  slice: "Slice",
  processGcode: "Process G-code",
  send: "Send",
  print: "Print",
  printReadiness: "Print readiness",
  testConnection: "Test connection",
  nozzleQuery: "Read printer nozzle",
  bedVolumeQuery: "Read printer geometry",
  discoverPrinters: "Discover printers"
} as const;

export type CliLabelValue = (typeof CliLabel)[keyof typeof CliLabel];
