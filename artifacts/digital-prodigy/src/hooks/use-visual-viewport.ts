import { useLayoutEffect, type RefObject } from "react";

/** Keep the standalone composer above an overlay keyboard without resizing the
 * native AgentPlace stage or intercepting pinch zoom. Writes are frame-batched;
 * keyboard animation must not rerender the conversation or its canvases. */
export function useVisualViewport(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    const element = ref.current;
    const viewport = window.visualViewport;
    if (!enabled || !element || !viewport) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Math.abs(viewport.scale - 1) > 0.01) return;
      element.style.setProperty(
        "--syntra-viewport-height",
        `${Math.round(viewport.height)}px`,
      );
      element.style.setProperty(
        "--syntra-viewport-top",
        `${Math.round(viewport.offsetTop)}px`,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      element.style.removeProperty("--syntra-viewport-height");
      element.style.removeProperty("--syntra-viewport-top");
    };
  }, [enabled, ref]);
}
