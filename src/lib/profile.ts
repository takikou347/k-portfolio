import { joinSchema, userColorSchema, type Join, type UserColor } from '../../shared/schema';

const PROFILE_KEY = 'kokuban:profile';

const NAME_POOL = [
  'たろう',
  'はなこ',
  'こまち',
  'ぴのこ',
  'すみれ',
  'かえで',
  'もんじゃ',
  'おむすび',
  'らくがき',
  'ちょーくん',
  'こくばんこ',
  'まぐねっと',
];

export const USER_COLORS: UserColor[] = [...userColorSchema.options];

export function randomName(): string {
  return NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
}

export function randomColor(): UserColor {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

export function loadProfile(): Join | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = joinSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Join): void {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // プライベートモード等で保存できなくても入室は続行する
  }
}
