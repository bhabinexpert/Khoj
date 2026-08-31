import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CloseIcon, WalletIcon } from './Icons.jsx';

/**
 * The support widget: a floating "Buy me a momo" button.
 *
 * Three decisions worth stating. It waits before appearing, because a donation
 * ask that lands on top of the first paint reads as an ad rather than a thank
 * you. It is dismissible, and the dismissal is remembered in `localStorage`, so
 * saying no once means no for good on this browser. And it sits on the left,
 * because the right-hand bottom corner is where the mobile filter drawer's
 * controls live — two floating things fighting over one thumb is a bug.
 */
const DISMISS_KEY = 'khoj:momo-dismissed';
const LOGO = 'https://buymemomo.com/logo.png';
const LINK = 'https://buymemomo.com/vabin';

export function MomoSupport({ delayMs = 4000 }) {
  const [state, setState] = useState('hidden');
  const [logoFailed, setLogoFailed] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') return undefined;
    } catch {
      // A blocked storage API is not a reason to hide the widget.
    }
    const timer = setTimeout(() => setState('shown'), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  function dismiss() {
    setState('dismissed');
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* Nothing to do — it will simply ask again next visit. */
    }
  }

  return (
    <AnimatePresence>
      {state === 'shown' ? (
        <motion.div
          className="fixed bottom-4 left-4 z-40 print:hidden"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        >
          <div className="group relative">
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss the support message"
              className="absolute -right-1.5 -top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full border border-ink-200 bg-white text-ink-400
                         opacity-0 shadow-xs transition-opacity hover:text-ink-700 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <CloseIcon className="h-3 w-3" />
            </button>

            <a
              href={LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-full border border-momo-200 bg-white/95 py-2 pl-2 pr-4 shadow-lift backdrop-blur
                         transition-all duration-200 hover:-translate-y-0.5 hover:border-momo-300 hover:shadow-pop"
            >
              {/* The logo is a remote asset, so it gets an explicit box: without
                  one, a slow or failed load reflows the whole pill. If the load
                  fails outright, a wallet glyph stands in so the box is never
                  an empty circle. */}
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-momo-50 ring-1 ring-inset ring-momo-200">
                {logoFailed ? (
                  <WalletIcon className="h-4 w-4 text-momo-600" />
                ) : (
                  <img
                    src={LOGO}
                    alt=""
                    width="36"
                    height="36"
                    loading="lazy"
                    onError={() => setLogoFailed(true)}
                    className="h-9 w-9 object-contain animate-breathe motion-reduce:animate-none"
                  />
                )}
              </span>
              <span className="text-left leading-tight">
                <span className="block text-sm font-bold text-ink-900">Buy me a momo</span>
                <span className="block text-[11px] font-medium text-ink-500">Khoj is free. Support it</span>
              </span>
            </a>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
