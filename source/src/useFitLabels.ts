import { useCallback, useEffect, useRef } from 'react';

const MIN_FONT_PX = 11;

let canvas: HTMLCanvasElement | null = null;

/** Width of a string at a given CSS font, without touching the DOM. */
function measureText(text: string, font: string): number {
  canvas = canvas || document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * Seat bubbles size themselves to their label. A label longer than the card is
 * wide would otherwise be clipped, so scale the whole group's font down until
 * the widest one fits. Applied per container, so one long session doesn't
 * shrink the others.
 *
 * The required size is computed directly from a canvas measurement rather than
 * by shrinking in a loop: reading element widths while mutating font size in a
 * tight loop gives unreliable numbers and overshoots badly.
 *
 * Returns a ref callback to attach to each `.ticket-chips` element.
 */
export function useFitLabels(deps: unknown[]) {
  const nodes = useRef(new Set<HTMLElement>());

  const fit = useCallback(() => {
    nodes.current.forEach((box) => {
      if (!box.isConnected) {
        nodes.current.delete(box);
        return;
      }
      const chips = Array.from(box.children) as HTMLElement[];
      if (!chips.length) return;

      // Start from the stylesheet size so this can grow back after a resize.
      box.style.fontSize = '';
      const boxStyle = getComputedStyle(box);
      const base = parseFloat(boxStyle.fontSize);
      if (!base) return;

      const chipStyle = getComputedStyle(chips[0]);
      const chipPadding =
        parseFloat(chipStyle.paddingLeft) +
        parseFloat(chipStyle.paddingRight) +
        parseFloat(chipStyle.borderLeftWidth) +
        parseFloat(chipStyle.borderRightWidth);

      // clientWidth includes the container's own padding; strip it to get the
      // width a chip may actually occupy.
      const contentWidth =
        box.clientWidth - parseFloat(boxStyle.paddingLeft) - parseFloat(boxStyle.paddingRight);
      const room = contentWidth - chipPadding - 1;
      if (room <= 0) return;

      const widest = chips.reduce(
        (max, c) => Math.max(max, measureText(c.textContent || '', chipStyle.font)),
        0
      );
      if (widest <= room) return; // everything fits at the stylesheet size

      const scaled = Math.floor(base * (room / widest));
      box.style.fontSize = `${Math.max(MIN_FONT_PX, scaled)}px`;
    });
  }, []);

  const register = useCallback((el: HTMLElement | null) => {
    if (el) nodes.current.add(el);
  }, []);

  useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ...deps]);

  return register;
}
