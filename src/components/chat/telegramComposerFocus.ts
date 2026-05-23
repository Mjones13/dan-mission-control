export type TelegramComposerFocusTarget = Pick<HTMLTextAreaElement, 'focus'> | null;

type FocusScheduler = {
  requestAnimationFrame?: (callback: () => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
  setTimeout?: (callback: () => void, delay: number) => number;
  clearTimeout?: (handle: number) => void;
};

/**
 * Focus the real Telegram composer textarea after reply state has had a chance
 * to commit and mount/re-render its reply target preview.
 */
export function focusTelegramComposerAfterReply(
  composer: TelegramComposerFocusTarget,
  scheduler: FocusScheduler | null = typeof window === 'undefined' ? null : window,
): () => void {
  if (!composer) return () => {};

  let focused = false;
  let canceled = false;
  let animationFrame: number | null = null;
  let timeout: number | null = null;

  const focusComposer = () => {
    if (focused || canceled) return;
    focused = true;
    composer.focus();
  };

  if (scheduler?.requestAnimationFrame) {
    animationFrame = scheduler.requestAnimationFrame(focusComposer);
  } else {
    focusComposer();
  }

  if (scheduler?.setTimeout) {
    timeout = scheduler.setTimeout(focusComposer, 0);
  }

  return () => {
    canceled = true;
    if (animationFrame !== null) scheduler?.cancelAnimationFrame?.(animationFrame);
    if (timeout !== null) scheduler?.clearTimeout?.(timeout);
  };
}
