import { avatarUrl } from './avatars';

export interface BoardMember {
  username: string;
  avatar_id: string;
}

// Split out from board.ts purely so this DOM-construction path is
// independently testable — it's the exact code that closed the stored-XSS
// finding (attribute breakout via innerHTML + string interpolation).
// Property assignment (img.alt = ...) goes through the DOM, never HTML
// parsing, so attacker-controlled member.username can never become markup
// here regardless of its content.
export function renderMemberAvatar(member: BoardMember): HTMLImageElement {
  const img = document.createElement('img');
  img.src = avatarUrl(member.avatar_id);
  img.alt = member.username;
  img.width = 40;
  img.height = 40;
  img.loading = 'lazy';
  return img;
}
