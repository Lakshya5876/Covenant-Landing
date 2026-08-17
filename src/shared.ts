// Shared between main.ts (index.html) and board.ts (board.html) — both are
// separate Vite entry points, so anything used on both pages lives here
// instead of being duplicated.

export const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

export function wireCopyButton(btn: HTMLButtonElement, getText: () => string) {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      const original = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('is-copied');
      window.setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('is-copied');
      }, 1600);
    } catch {
      /* clipboard unavailable — silently ignore, text is still selectable */
    }
  });
}

export function setupCopyButtons() {
  document.querySelectorAll<HTMLElement>('[data-copy]').forEach((wrap) => {
    const btn = wrap.querySelector<HTMLButtonElement>('[data-copy-btn]');
    const codeEl = wrap.querySelector('code');
    if (!btn || !codeEl) return;
    wireCopyButton(btn, () => codeEl.innerText);
  });
}

export function setupTabs() {
  document.querySelectorAll<HTMLElement>('[data-tabs]').forEach((tabRoot) => {
    const buttons = Array.from(tabRoot.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
    const panels = tabRoot.querySelectorAll<HTMLElement>('[data-tab-panel]');

    const activate = (btn: HTMLButtonElement, focus: boolean) => {
      const target = btn.dataset.tab;
      buttons.forEach((b) => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
        b.tabIndex = b === btn ? 0 : -1;
      });
      panels.forEach((p) => {
        p.hidden = p.dataset.tabPanel !== target;
      });
      if (focus) btn.focus();
    };

    buttons.forEach((btn, i) => {
      btn.tabIndex = btn.classList.contains('is-active') ? 0 : -1;
      btn.addEventListener('click', () => activate(btn, true));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const next = e.key === 'ArrowRight' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
          activate(buttons[next], true);
        }
      });
    });
  });
}

export const BOARD_MEMBER_KEY = 'covenant_board_member';
export const BOARD_IDENTITY_KEY = 'covenant_board_identity';

export function setupResetButton() {
  const btn = document.querySelector<HTMLButtonElement>('[data-board-reset]');
  btn?.addEventListener('click', () => {
    window.localStorage.removeItem(BOARD_MEMBER_KEY);
    window.localStorage.removeItem(BOARD_IDENTITY_KEY);
    window.location.href = '/board.html';
  });
}

export function animateCount(el: HTMLElement, target: number) {
  if (prefersReducedMotion || target === 0) {
    el.textContent = String(target);
    return;
  }
  const duration = 900;
  const start = performance.now();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.textContent = String(target);
  };
  // requestAnimationFrame is throttled/paused in a backgrounded tab (switch
  // tabs mid-count, or an automated/headless context), which would leave the
  // number stuck. A timeout safety net guarantees the final value lands
  // regardless — same pattern as the latch fix.
  window.setTimeout(finish, duration + 200);
  const step = (now: number) => {
    if (done) return;
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(eased * target));
    if (t < 1) requestAnimationFrame(step);
    else finish();
  };
  requestAnimationFrame(step);
}
