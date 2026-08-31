import { useState } from 'react';
import { WalletIcon } from './Icons.jsx';

/**
 * Permanent floating support button — logo only, no text, and never dismissed.
 * It sits bottom-left so it never collides with the mobile filter drawer's
 * bottom-right controls. If the remote logo fails to load, a wallet glyph stands
 * in so the circle is never empty.
 */
const LOGO = 'https://buymemomo.com/logo.png';
const LINK = 'https://buymemomo.com/vabin';

export function MomoSupport() {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <a
      href={LINK}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buy me a momo — support Khoj"
      title="Buy me a momo"
      className="fixed bottom-4 left-4 z-40 grid h-14 w-14 place-items-center overflow-hidden rounded-full border border-momo-200
                 bg-white/95 shadow-lift backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-momo-300
                 hover:shadow-pop print:hidden"
    >
      {logoFailed ? (
        <WalletIcon className="h-6 w-6 text-momo-600" />
      ) : (
        <img
          src={LOGO}
          alt=""
          width="40"
          height="40"
          loading="lazy"
          onError={() => setLogoFailed(true)}
          className="h-9 w-9 object-contain animate-breathe motion-reduce:animate-none"
        />
      )}
    </a>
  );
}
