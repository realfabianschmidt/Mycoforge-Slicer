import { Folder, Layers, PenTool, Printer } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkflowStep } from "../../hooks/use-workflow";

export interface StepDescriptor {
  id: WorkflowStep;
  num: string;
  name: string;
  icon: ReactNode;
}

/** Static metadata for the four workflow steps — shared by Spine and Rail. */
export const STEP_DESCRIPTORS: StepDescriptor[] = [
  { id: "source", num: "01", name: "Source", icon: <Folder size={15} /> },
  { id: "profile", num: "02", name: "Profile", icon: <PenTool size={15} /> },
  { id: "slice", num: "03", name: "Slice", icon: <Layers size={15} /> },
  { id: "print", num: "04", name: "Print", icon: <Printer size={15} /> }
];

export function stepDescriptor(step: WorkflowStep): StepDescriptor {
  return STEP_DESCRIPTORS.find((descriptor) => descriptor.id === step) ?? STEP_DESCRIPTORS[0];
}
