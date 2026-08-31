import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/cn.js';

/**
 * Aceternity-style primitives, hand-built.
 *
 * Aceternity UI is a copy-paste library, not an npm package — the components
 * below are its patterns (aurora background, spotlight card, animated gradient
 * border, text reveal) implemented on framer-motion + Tailwind so they use this
 * project's own tokens and ship no extra runtime beyond framer-motion.
 *
 * Every animation respects `prefers-reduced-motion`: the decorated variants
 * fall back to the plain, static rendering rather than being merely slower.
 */

/** Soft drifting colour wash. Purely decorative, hence aria-hidden. */
export function AuroraBackground({ className = '' }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {/* Three washes only, at low opacity. The restraint is the point: a hero
          that glows like a gaming keyboard reads as a template, not a product. */}
      <div className="absolute -left-28 -top-36 h-[30rem] w-[30rem] animate-aurora rounded-full bg-brand-200/50 blur-3xl motion-reduce:animate-none" />
      <div className="absolute -right-24 -top-20 h-[26rem] w-[26rem] animate-aurora rounded-full bg-sky-200/45 blur-3xl [animation-delay:-7s] motion-reduce:animate-none" />
      <div className="absolute bottom-[-14rem] left-1/3 h-[28rem] w-[28rem] animate-aurora rounded-full bg-ink-200/50 blur-3xl [animation-delay:-14s] motion-reduce:animate-none" />
      {/* The faint engineering grid, masked so it fades before the section edge.
          `bg-grid` carries both the image and its 56px tile — the two live under
          one token name in the Tailwind config. */}
      <div className="absolute inset-0 bg-grid [-webkit-mask-image:radial-gradient(70%_60%_at_50%_35%,black,transparent)] [mask-image:radial-gradient(70%_60%_at_50%_35%,black,transparent)]" />
    </div>
  );
}

/** A conic gradient rotating behind a slightly inset surface. */
export function GradientBorder({ children, className = '', innerClassName = '' }) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl p-[1.5px]', className)}>
      <span
        aria-hidden
        className="absolute inset-[-100%] animate-spin-slow bg-[conic-gradient(from_0deg,transparent_0%,#c8102e_18%,#38bdf8_38%,transparent_58%)] motion-reduce:animate-none"
      />
      <div className={cn('relative rounded-[calc(1rem-1px)] bg-white', innerClassName)}>{children}</div>
    </div>
  );
}

/** Fades and lifts its children into view once, when scrolled to. */
export function Reveal({ children, delay = 0, className = '', as = 'div' }) {
  const still = useReducedMotion();
  const Component = motion[as] || motion.div;
  if (still) return <div className={className}>{children}</div>;
  return (
    <Component
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-64px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </Component>
  );
}

/** Lifts on hover, with a cursor-following highlight. */
export function SpotlightCard({ children, className = '' }) {
  const still = useReducedMotion();
  return (
    <motion.div
      whileHover={still ? undefined : { y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      onMouseMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--x', `${event.clientX - box.left}px`);
        event.currentTarget.style.setProperty('--y', `${event.clientY - box.top}px`);
      }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-ink-200 bg-white p-5 shadow-card transition-shadow',
        'before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity',
        'before:bg-[radial-gradient(240px_circle_at_var(--x,50%)_var(--y,0%),rgba(200,16,46,0.08),transparent_70%)]',
        'hover:border-ink-300 hover:shadow-lift group-hover:before:opacity-100 hover:before:opacity-100',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

/** Word-by-word reveal. Keeps the whole phrase in one accessible text node. */
export function TextReveal({ text, className = '', delay = 0 }) {
  const still = useReducedMotion();
  if (still) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split(' ').map((word, index) => (
          <motion.span
            key={`${word}-${index}`}
            initial={{ opacity: 0, y: '0.4em' }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: delay + index * 0.055, ease: [0.22, 1, 0.36, 1] }}
            className="inline-block whitespace-pre"
          >
            {word}{' '}
          </motion.span>
        ))}
      </span>
    </span>
  );
}
