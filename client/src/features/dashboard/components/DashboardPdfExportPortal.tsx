import type { ComponentProps, MutableRefObject } from "react";
import { createPortal } from "react-dom";

import { DashboardPdfExportDocument } from "./DashboardPdfExportDocument";

type DashboardPdfExportPortalProps = ComponentProps<typeof DashboardPdfExportDocument> & {
  exportRef: MutableRefObject<HTMLDivElement | null>;
  shouldRender: boolean;
};

export function DashboardPdfExportPortal({
  exportRef,
  shouldRender,
  ...documentProps
}: DashboardPdfExportPortalProps) {
  if (!shouldRender || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-[-20000px] top-0 z-[-1] opacity-100"
    >
      <div ref={exportRef} className="bg-white">
        <DashboardPdfExportDocument {...documentProps} />
      </div>
    </div>,
    document.body,
  );
}
