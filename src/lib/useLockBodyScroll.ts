import { useEffect } from 'react';

let activeLockCount = 0;
let savedScrollY = 0;

/**
 * Locks underlying page scrolling whenever a modal, bottom sheet, or popup is open.
 * Reference-counted so nested popups inside modals never prematurely unlock body scroll.
 */
export function useLockBodyScroll(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked || typeof document === 'undefined') return;

    if (activeLockCount === 0) {
      savedScrollY = window.scrollY || window.pageYOffset || 0;
      const body = document.body;
      const html = document.documentElement;
      body.style.overflow = 'hidden';
      body.style.overscrollBehavior = 'none';
      body.style.position = 'fixed';
      body.style.top = `-${savedScrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      html.style.overflow = 'hidden';
    }
    activeLockCount++;

    return () => {
      activeLockCount = Math.max(0, activeLockCount - 1);
      if (activeLockCount === 0 && typeof document !== 'undefined') {
        const body = document.body;
        const html = document.documentElement;
        body.style.overflow = '';
        body.style.overscrollBehavior = '';
        body.style.position = '';
        body.style.top = '';
        body.style.left = '';
        body.style.right = '';
        body.style.width = '';
        html.style.overflow = '';
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [isLocked]);
}
