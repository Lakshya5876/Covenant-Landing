import './style.css';
import {
  setupCopyButtons,
  setupTabs,
  wireCopyButton,
  setupResetButton,
  BOARD_MEMBER_KEY,
  BOARD_IDENTITY_KEY as IDENTITY_KEY,
} from './shared';
import { avatarUrl } from './avatars';

/* ============================================================
   Gate: this page is the Board's reward. No flag, no page —
   send them to join first instead of showing it half-broken.
   ============================================================ */
if (window.localStorage.getItem(BOARD_MEMBER_KEY) !== '1') {
  window.location.replace('/board.html');
} else {
  const raw = window.localStorage.getItem(IDENTITY_KEY);
  if (raw) {
    try {
      const identity = JSON.parse(raw) as { username: string; avatarId: string };
      const wrap = document.querySelector<HTMLElement>('[data-identity]');
      const img = document.querySelector<HTMLImageElement>('[data-identity-avatar]');
      const name = document.querySelector<HTMLElement>('[data-identity-username]');
      if (wrap && img && name) {
        img.src = avatarUrl(identity.avatarId);
        name.textContent = `@${identity.username}`;
        wrap.hidden = false;
      }
    } catch {
      /* malformed local data — the page still works without the identity header */
    }
  }
}

setupTabs();
setupCopyButtons();
setupResetButton();

const copyAllBtn = document.querySelector<HTMLButtonElement>('[data-copy-all]');
if (copyAllBtn) {
  wireCopyButton(copyAllBtn, () => {
    const activePlatform =
      document.querySelector<HTMLElement>('.tabs__panel[data-tab-panel]:not([hidden])')?.querySelector('code')
        ?.innerText ?? '';
    return ['git clone https://github.com/Lakshya5876/Covenant.git', activePlatform, 'claude', '/init-governance'].join(
      '\n'
    );
  });
}

/* ============================================================
   Reveal on scroll (same pattern as the main site)
   ============================================================ */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealTargets = document.querySelectorAll<HTMLElement>('.reveal');
if (prefersReducedMotion || !('IntersectionObserver' in window)) {
  revealTargets.forEach((el) => el.classList.add('is-visible'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  revealTargets.forEach((el) => io.observe(el));
}
