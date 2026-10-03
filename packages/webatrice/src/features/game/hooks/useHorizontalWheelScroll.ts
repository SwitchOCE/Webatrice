import { useEffect, type RefObject } from 'react';

/**
 * Turns vertical wheel input over a horizontally scrolling element into
 * horizontal scroll, while the element can scroll. Attached with
 * addEventListener and `{ passive: false }`: React's synthetic onWheel is
 * passive, so calling preventDefault there warns on every scroll and the
 * scroll still bubbles to the page.
 */
export function useHorizontalWheelScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) {
        return;
      }
      if (e.deltaY === 0) {
        return;
      }
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [ref]);
}
