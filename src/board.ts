import './style.css';
import {
  prefersReducedMotion,
  setupCopyButtons,
  setupTabs,
  animateCount,
  setupResetButton,
  BOARD_MEMBER_KEY,
  BOARD_IDENTITY_KEY as IDENTITY_KEY,
} from './shared';
import { AVATARS, avatarUrl } from './avatars';
import { renderMemberAvatar } from './board-render';

setupTabs();
setupCopyButtons();
setupResetButton();

/* ============================================================
   Count + recent arrivals
   ============================================================ */
async function loadCount(): Promise<number> {
  const countEl = document.querySelector<HTMLElement>('[data-board-count-num]');
  try {
    const res = await fetch('/api/board/count');
    const data = (await res.json()) as { count: number };
    if (countEl) animateCount(countEl, data.count);
    return data.count;
  } catch {
    if (countEl) countEl.textContent = '0';
    return 0;
  }
}

async function loadRecent() {
  const wrap = document.querySelector<HTMLElement>('[data-board-recent]');
  const strip = document.querySelector<HTMLElement>('[data-recent-strip]');
  if (!wrap || !strip) return;
  try {
    const res = await fetch('/api/board/members');
    const data = (await res.json()) as { members: { username: string; avatar_id: string }[] };
    if (!data.members.length) return;
    strip.replaceChildren(...data.members.slice(0, 12).map(renderMemberAvatar));
    wrap.hidden = false;
  } catch {
    /* no recent strip — fine, it's decoration */
  }
}

void loadCount();
void loadRecent();

/* ============================================================
   Open the join panel — or, for a returning member, skip straight
   to their setup page instead of making them fill the form again.
   ============================================================ */
const openBtn = document.querySelector<HTMLButtonElement>('[data-open-join]');
const joinPanel = document.querySelector<HTMLElement>('[data-join-panel]');

const alreadyJoined = window.localStorage.getItem(BOARD_MEMBER_KEY) === '1';
if (alreadyJoined && openBtn) {
  openBtn.textContent = 'View your setup →';
}

openBtn?.addEventListener('click', () => {
  if (alreadyJoined) {
    window.location.href = '/install.html';
    return;
  }
  if (!joinPanel) return;
  joinPanel.hidden = false;
  joinPanel.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  document.getElementById('jf-username')?.focus();
});

/* ============================================================
   Avatar picker
   ============================================================ */
let selectedAvatarId: string | null = null;

function setupAvatarPicker() {
  const grid = document.querySelector<HTMLElement>('[data-avatar-grid]');
  if (!grid) return;

  grid.innerHTML = AVATARS.map(
    (a) =>
      `<button type="button" class="avatar-pick" data-avatar-id="${a.id}" role="option" aria-selected="false" aria-label="Avatar ${a.id}">
        <img src="${avatarUrl(a.id)}" alt="" width="64" height="64" loading="lazy">
      </button>`
  ).join('');

  const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>('.avatar-pick'));
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => {
        b.classList.remove('is-selected');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-selected');
      btn.setAttribute('aria-selected', 'true');
      selectedAvatarId = btn.dataset.avatarId ?? null;
    });
  });
}
setupAvatarPicker();

/* ============================================================
   Submit — on success, the reward lives on its own page.
   ============================================================ */
interface JoinResponse {
  ok: boolean;
  error?: string;
}

function setupForm() {
  const form = document.querySelector<HTMLFormElement>('[data-join-form]');
  const submitBtn = document.querySelector<HTMLButtonElement>('[data-join-submit]');
  const errorEl = document.querySelector<HTMLElement>('[data-form-error]');
  if (!form || !submitBtn) return;

  const showError = (msg: string) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  };
  const clearError = () => {
    if (!errorEl) return;
    errorEl.hidden = true;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const usernameInput = document.getElementById('jf-username') as HTMLInputElement;
    const emailInput = document.getElementById('jf-email') as HTMLInputElement;
    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();

    if (username.length < 2) return showError('Username must be at least 2 characters.');
    if (!emailInput.checkValidity()) return showError("That email doesn't look right.");
    if (!selectedAvatarId) return showError('Pick an avatar first.');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Joining…';

    try {
      const res = await fetch('/api/board/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, avatarId: selectedAvatarId }),
      });
      const data = (await res.json()) as JoinResponse;
      if (!res.ok || !data.ok) {
        showError(data.error ?? 'Could not join right now. Try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Join the Board';
        return;
      }

      window.localStorage.setItem(BOARD_MEMBER_KEY, '1');
      window.localStorage.setItem(IDENTITY_KEY, JSON.stringify({ username, avatarId: selectedAvatarId }));
      window.location.href = '/install.html';
    } catch {
      showError('Network hiccup — try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Join the Board';
    }
  });
}
setupForm();
