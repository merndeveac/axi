import { lazy, Suspense } from "react";
import { resolveUiVersion } from "./ui-version";

const uiVersion = resolveUiVersion(
  window.location.search,
  import.meta.env.VITE_AXI_UI_VERSION
);

const SelectedApp =
  uiVersion === "v2"
    ? lazy(async () => {
        const module = await import("./v2/GoldenPathApp");
        return { default: module.GoldenPathApp };
      })
    : lazy(async () => {
        const module = await import("./legacy/LegacyApp");
        return { default: module.LegacyApp };
      });

export function App() {
  return (
    <Suspense fallback={<div aria-live="polite">Loading AXI…</div>}>
      <SelectedApp />
    </Suspense>
  );
}
