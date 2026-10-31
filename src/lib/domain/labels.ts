import type { BackofficeData } from "./types";

/** "Company" for business-level items, otherwise "Customer · Project" (or the internal project name). */
export function assignmentLabel(data: BackofficeData, projectId: string | null): string {
  if (!projectId) return "Company";
  const p = data.projects.find((x) => x.id === projectId);
  if (!p) return "Unknown project";
  return p.customerName ? `${p.customerName} · ${p.name}` : p.name;
}
