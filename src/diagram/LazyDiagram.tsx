/** Lazy entry point for diagrams, so dagre and the renderer are not in the first download. */
import { lazy, Suspense } from "react";
import type { DiagramProps } from "./AutomatonDiagram.tsx";

// dagre and the renderer load only when the first diagram is needed
const AutomatonDiagram = lazy(() => import("./AutomatonDiagram.tsx").then((m) => ({ default: m.AutomatonDiagram })));

export function Diagram(props: DiagramProps) {
  return (
    <Suspense fallback={<p className="help" role="status">Drawing the diagram…</p>}>
      <AutomatonDiagram {...props} />
    </Suspense>
  );
}
