import { lazy, Suspense } from "react";
import type { DiagramProps } from "./AutomatonDiagram.tsx";

// dagre and the renderer load with the first diagram, not in the first download
const AutomatonDiagram = lazy(() => import("./AutomatonDiagram.tsx").then((m) => ({ default: m.AutomatonDiagram })));

/** Past this many states a diagram is too tangled to read; pages show the table instead. */
export const DRAW_LIMIT = 40;

export function Diagram(props: DiagramProps) {
  return (
    <Suspense fallback={<p className="help" role="status">Drawing the diagram…</p>}>
      <AutomatonDiagram {...props} />
    </Suspense>
  );
}
