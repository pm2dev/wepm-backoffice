import type { Metadata } from "next";
import { ProjectProfileRoute } from "@/components/projects/project-profile";

export const metadata: Metadata = { title: "Project" };

export default function Page() {
  return <ProjectProfileRoute />;
}
