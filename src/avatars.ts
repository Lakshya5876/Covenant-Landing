export interface AvatarMeta {
  id: string;
}

export const AVATARS: AvatarMeta[] = Array.from({ length: 30 }, (_, i) => ({
  id: `avatar-${String(i + 1).padStart(2, '0')}`,
}));

export function avatarUrl(id: string): string {
  return `/avatars/${id}.png`;
}
