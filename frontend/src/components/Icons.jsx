import {
  LuArrowLeft,
  LuArrowRight,
  LuBadgeCheck,
  LuBookmark,
  LuBot,
  LuCheck,
  LuChevronDown,
  LuClock,
  LuCompass,
  LuExternalLink,
  LuFileText,
  LuGithub,
  LuGlobe,
  LuLayers,
  LuLinkedin,
  LuMail,
  LuMapPin,
  LuPlus,
  LuRefreshCw,
  LuSearch,
  LuShieldCheck,
  LuSlidersHorizontal,
  LuSparkles,
  LuTarget,
  LuTrash2,
  LuUpload,
  LuUserRound,
  LuWallet,
  LuX,
} from 'react-icons/lu';
import { cn } from '../lib/cn.js';

/**
 * The app's single icon vocabulary, wrapped once.
 *
 * `react-icons/lu` *is* Lucide, so this is one family throughout rather than a
 * mix of hand-drawn SVGs and a package. Wrapping matters for two reasons:
 * react-icons emits `width="1em" height="1em"` attributes, so every call site
 * would otherwise have to remember to size the glyph, and it emits no
 * `aria-hidden` — an unlabelled decorative icon is noise for a screen reader.
 * Both defaults live here, and `cn()` lets a caller's own size win.
 */
function icon(Glyph, fallbackClass = 'h-5 w-5') {
  const Wrapped = ({ className, ...rest }) => (
    <Glyph aria-hidden="true" focusable="false" {...rest} className={cn(fallbackClass, className)} />
  );
  Wrapped.displayName = `Icon(${Glyph.name || 'lu'})`;
  return Wrapped;
}

/* The names the app already used, kept so no call site has to change. */
export const SearchIcon = icon(LuSearch);
export const UploadIcon = icon(LuUpload);
export const ExternalLinkIcon = icon(LuExternalLink, 'h-3.5 w-3.5');
export const ChevronDownIcon = icon(LuChevronDown, 'h-4 w-4');
export const CloseIcon = icon(LuX);
export const FilterIcon = icon(LuSlidersHorizontal, 'h-4 w-4');
export const CheckIcon = icon(LuCheck, 'h-4 w-4');
export const MapPinIcon = icon(LuMapPin, 'h-3.5 w-3.5');
export const ClockIcon = icon(LuClock, 'h-3.5 w-3.5');
export const WalletIcon = icon(LuWallet, 'h-3.5 w-3.5');
export const DocumentIcon = icon(LuFileText);
export const TrashIcon = icon(LuTrash2, 'h-4 w-4');
export const SparkleIcon = icon(LuSparkles, 'h-4 w-4');

/* Names the rest of the UI needs. */
export const ArrowLeftIcon = icon(LuArrowLeft, 'h-4 w-4');
export const ArrowRightIcon = icon(LuArrowRight, 'h-4 w-4');
export const PlusIcon = icon(LuPlus, 'h-4 w-4');
export const RefreshIcon = icon(LuRefreshCw, 'h-4 w-4');
export const CompassIcon = icon(LuCompass);
export const UserIcon = icon(LuUserRound);
export const GithubIcon = icon(LuGithub);
export const LinkedinIcon = icon(LuLinkedin);
export const MailIcon = icon(LuMail);
export const GlobeIcon = icon(LuGlobe);
export const LayersIcon = icon(LuLayers);
export const BotIcon = icon(LuBot);
export const ShieldIcon = icon(LuShieldCheck);
export const TargetIcon = icon(LuTarget);
export const VerifiedIcon = icon(LuBadgeCheck);

/**
 * The one icon with state. Lucide has no filled bookmark, so the fill comes
 * from `currentColor` — which means the saved and unsaved glyphs are the same
 * outline at the same weight, and only the interior changes.
 */
export const BookmarkIcon = ({ filled = false, className, ...rest }) => (
  <LuBookmark
    aria-hidden="true"
    focusable="false"
    {...rest}
    fill={filled ? 'currentColor' : 'none'}
    className={cn('h-5 w-5', className)}
  />
);

/**
 * Kept as hand-written SVG on purpose: a spinner is an animation primitive, not
 * a glyph. The two-tone arc (faint ring + bright quarter) reads as motion at
 * 14px where a rotating icon just blurs.
 */
export const Spinner = ({ className = 'h-5 w-5' }) => (
  <svg
    className={cn('animate-spin motion-reduce:animate-none', className)}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.5" />
    <path
      d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);
