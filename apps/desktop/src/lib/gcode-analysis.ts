export type PreviewMoveType = "extrusion" | "travel" | "retract" | "prime" | "layer_change" | "other";

export interface PreviewEvent {
  type: "retract" | "prime";
  line: number;
  x: number;
  y: number;
  z: number;
  amount?: number;
  speed?: number;
}

export interface PreviewWarning {
  line: number;
  message: string;
}

export interface GCodeStats {
  layerCount: number;
  extrusionMoves: number;
  travelMoves: number;
  retracts: number;
  primes: number;
  minFeedrate?: number;
  maxFeedrate?: number;
  events: PreviewEvent[];
  warnings: PreviewWarning[];
}

export interface PreviewFilterOptions {
  showExtrusion: boolean;
  showTravel: boolean;
  showRetractPrime: boolean;
}

interface MachineState {
  x: number;
  y: number;
  z: number;
  e: number;
  extrusionMode: "absolute" | "relative";
  currentLayer: number;
}

interface ClassifiedLine {
  line: string;
  lineNumber: number;
  type: PreviewMoveType;
  length?: number;
}

const PARAM_RE = /([A-Za-z])([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)/g;
const EPSILON = 1e-9;

export function analyzeGCode(gcode: string, lineWidthMm = 1): GCodeStats {
  const state = initialState();
  const stats: GCodeStats = {
    layerCount: 0,
    extrusionMoves: 0,
    travelMoves: 0,
    retracts: 0,
    primes: 0,
    events: [],
    warnings: []
  };
  let maxLayer = 0;

  for (const classified of classifyGCodeLines(gcode, state, (event) => stats.events.push(event))) {
    const feedrate = parseParams(stripComment(classified.line).code).params.F;
    if (feedrate !== undefined && ["extrusion", "travel", "retract", "prime"].includes(classified.type)) {
      stats.minFeedrate = stats.minFeedrate === undefined ? feedrate : Math.min(stats.minFeedrate, feedrate);
      stats.maxFeedrate = stats.maxFeedrate === undefined ? feedrate : Math.max(stats.maxFeedrate, feedrate);
    }

    if (classified.type === "extrusion") {
      stats.extrusionMoves += 1;
      const length = classified.length;
      if (length !== undefined && length < lineWidthMm) {
        stats.warnings.push({
          line: classified.lineNumber,
          message: `Short extrusion segment ${formatNumber(length)} mm`
        });
      }
    }
    if (classified.type === "travel") stats.travelMoves += 1;
    if (classified.type === "retract") stats.retracts += 1;
    if (classified.type === "prime") stats.primes += 1;
    maxLayer = Math.max(maxLayer, state.currentLayer);
  }

  stats.layerCount = maxLayer + 1;
  return stats;
}

export function filterGCodeForPreview(gcode: string, options: PreviewFilterOptions): string {
  const state = initialState();
  const output: string[] = [];

  for (const classified of classifyGCodeLines(gcode, state)) {
    if (classified.type === "extrusion" && !options.showExtrusion) continue;
    if (classified.type === "travel" && !options.showTravel) continue;
    if (["retract", "prime"].includes(classified.type) && !options.showRetractPrime) continue;
    output.push(classified.line);
  }

  return output.join("\n");
}

function* classifyGCodeLines(
  gcode: string,
  state: MachineState,
  onEvent?: (event: PreviewEvent) => void
): Generator<ClassifiedLine> {
  const lines = gcode.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (/^;LAYER:/i.test(trimmed)) {
      const match = trimmed.match(/^;LAYER:\s*(-?\d+)/i);
      if (match) state.currentLayer = Math.max(0, Number(match[1]));
      yield { line, lineNumber, type: "layer_change" };
      continue;
    }

    const macro = parseMycoMacro(trimmed);
    if (macro) {
      onEvent?.({ ...macro, line: lineNumber, x: state.x, y: state.y, z: state.z });
      yield { line, lineNumber, type: macro.type };
      continue;
    }

    const { code } = stripComment(line);
    const parsed = parseParams(code);
    if (!parsed.command) {
      yield { line, lineNumber, type: "other" };
      continue;
    }

    if (parsed.command === "M82") {
      state.extrusionMode = "absolute";
      yield { line, lineNumber, type: "other" };
      continue;
    }
    if (parsed.command === "M83") {
      state.extrusionMode = "relative";
      yield { line, lineNumber, type: "other" };
      continue;
    }
    if (parsed.command === "G92" && parsed.params.E !== undefined) {
      state.e = parsed.params.E;
      yield { line, lineNumber, type: "other" };
      continue;
    }
    if (parsed.command !== "G0" && parsed.command !== "G1") {
      yield { line, lineNumber, type: "other" };
      continue;
    }

    const previous = { ...state };
    const hasX = parsed.params.X !== undefined;
    const hasY = parsed.params.Y !== undefined;
    const hasZ = parsed.params.Z !== undefined;
    const hasXY = hasX || hasY;
    const hasE = parsed.params.E !== undefined;
    const nextX = parsed.params.X ?? state.x;
    const nextY = parsed.params.Y ?? state.y;
    const nextZ = parsed.params.Z ?? state.z;
    const length = Math.sqrt(
      Math.pow(nextX - previous.x, 2) + Math.pow(nextY - previous.y, 2) + Math.pow(nextZ - previous.z, 2)
    );

    let deltaE = 0;
    if (hasE) {
      deltaE = state.extrusionMode === "relative" ? parsed.params.E! : parsed.params.E! - state.e;
      state.e = state.extrusionMode === "relative" ? state.e + deltaE : parsed.params.E!;
    }
    state.x = nextX;
    state.y = nextY;
    state.z = nextZ;

    if (hasZ && Math.abs(nextZ - previous.z) > EPSILON && !hasXY) {
      state.currentLayer += nextZ > previous.z ? 1 : 0;
    }

    if (deltaE < -EPSILON) {
      onEvent?.({
        type: "retract",
        line: lineNumber,
        x: previous.x,
        y: previous.y,
        z: previous.z,
        amount: Math.abs(deltaE),
        speed: parsed.params.F
      });
      yield { line, lineNumber, type: "retract" };
      continue;
    }
    if (deltaE > EPSILON && !hasXY) {
      onEvent?.({
        type: "prime",
        line: lineNumber,
        x: previous.x,
        y: previous.y,
        z: previous.z,
        amount: deltaE,
        speed: parsed.params.F
      });
      yield { line, lineNumber, type: "prime" };
      continue;
    }
    if (deltaE > EPSILON && hasXY) {
      yield { line, lineNumber, type: "extrusion", length };
      continue;
    }
    if (hasXY) {
      yield { line, lineNumber, type: "travel", length };
      continue;
    }
    if (hasZ) {
      yield { line, lineNumber, type: "layer_change" };
      continue;
    }
    yield { line, lineNumber, type: "other" };
  }
}

function initialState(): MachineState {
  return {
    x: 0,
    y: 0,
    z: 0,
    e: 0,
    extrusionMode: "absolute",
    currentLayer: 0
  };
}

function stripComment(line: string): { code: string; comment: string } {
  const index = line.indexOf(";");
  if (index === -1) return { code: line.trim(), comment: "" };
  return { code: line.slice(0, index).trim(), comment: line.slice(index) };
}

function parseParams(code: string): { command?: string; params: Record<string, number> } {
  const params: Record<string, number> = {};
  let command: string | undefined;
  for (const match of code.matchAll(PARAM_RE)) {
    const letter = match[1].toUpperCase();
    const value = Number(match[2]);
    if (!command && ["G", "M", "T"].includes(letter)) {
      command = `${letter}${Math.trunc(value)}`;
    } else {
      params[letter] = value;
    }
  }
  return { command, params };
}

function parseMycoMacro(trimmed: string): Omit<PreviewEvent, "line" | "x" | "y" | "z"> | undefined {
  if (!/^MYCO_(RETRACT|PRIME)\b/i.test(trimmed)) return undefined;
  const type = /^MYCO_RETRACT\b/i.test(trimmed) ? "retract" : "prime";
  const amount = trimmed.match(/\bAMOUNT=([-+]?\d+(?:\.\d+)?)/i);
  const speed = trimmed.match(/\bSPEED=([-+]?\d+(?:\.\d+)?)/i);
  return {
    type,
    amount: amount ? Number(amount[1]) : undefined,
    speed: speed ? Number(speed[1]) : undefined
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
