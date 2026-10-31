import type { Metadata } from "next";
import { ProjectListPage } from "@/components/projects/project-list";

export const metadata: Metadata = { title: "Projects" };

export default function Page() {
  return <ProjectListPage />;
}
