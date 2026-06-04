import { invoke } from "@tauri-apps/api/core";
import type { MaterialProfile } from "./settings";

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

export interface ModelTransform {
  translateXMm: number;
  translateYMm: number;
  translateZMm: number;
  rotateXDeg: number;
  rotateYDeg: number;
  rotateZDeg: number;
  scale: number;
  centerXMm?: number;
  centerYMm?: number;
}

export async function listMaterialProfiles(): Promise<MaterialProfile[]> {
  return invoke<MaterialProfile[]>("list_material_profiles");
}

export async function runMycoforge(args: string[]): Promise<CommandResult> {
  return invoke<CommandResult>("run_mycoforge", { args });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function readBinaryFile(path: string): Promise<number[]> {
  return invoke<number[]>("read_binary_file", { path });
}

export async function prepareTransformedStl(path: string, transform: ModelTransform): Promise<string> {
  return invoke<string>("prepare_transformed_stl", { path, transform });
}

export async function pickJobFile(): Promise<string | null> {
  return invoke<string | null>("pick_job_file");
}
