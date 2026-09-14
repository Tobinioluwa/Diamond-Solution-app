/**
 * Utility for formatting and resolving scholar names and usernames.
 * Ensures the real user name (e.g., "Peter") is always displayed instead of
 * generic "Scholar" fallbacks across the leaderboard, dashboards, and profiles.
 */

export function formatScholarName(data: any): string {
  if (!data) return 'Scholar';

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed || trimmed.toLowerCase() === 'scholar') {
      return 'Scholar';
    }
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  const username = (typeof data.username === 'string' ? data.username : '').trim();
  const displayName = (typeof data.displayName === 'string' ? data.displayName : '').trim();
  const fullName = (typeof data.fullName === 'string' ? data.fullName : (typeof data.name === 'string' ? data.name : '')).trim();
  const email = (typeof data.email === 'string' ? data.email : '').trim();

  // 1. Check clean username (if not generic 'scholar' and no email domain)
  if (username && username.toLowerCase() !== 'scholar' && !username.includes('@')) {
    return username.charAt(0).toUpperCase() + username.slice(1);
  }

  // 2. Check displayName (if not generic 'scholar' and no email domain)
  if (displayName && displayName.toLowerCase() !== 'scholar' && !displayName.includes('@')) {
    return displayName.charAt(0).toUpperCase() + displayName.slice(1);
  }

  // 3. Check fullName / name
  if (fullName && fullName.toLowerCase() !== 'scholar' && !fullName.includes('@')) {
    return fullName.charAt(0).toUpperCase() + fullName.slice(1);
  }

  // 4. Derive from email (e.g., peteradekunle923@gmail.com -> Peter)
  if (email && email.includes('@')) {
    const rawPrefix = email.split('@')[0];
    const stripped = rawPrefix.replace(/\d+$/, '');
    const cleanPrefix = stripped.length >= 2 ? stripped : rawPrefix;
    if (cleanPrefix && cleanPrefix.toLowerCase() !== 'scholar') {
      return cleanPrefix.charAt(0).toUpperCase() + cleanPrefix.slice(1);
    }
  }

  // 5. Fallback to username or displayName if anything was provided
  if (username) return username.charAt(0).toUpperCase() + username.slice(1);
  if (displayName) return displayName.charAt(0).toUpperCase() + displayName.slice(1);

  return 'Scholar';
}

export function getScholarInitials(name: string): string {
  if (!name || name.trim().length === 0) return 'SC';
  const clean = name.trim();
  const parts = clean.split(/\s+/);
  if (parts.length > 1 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.substring(0, Math.min(2, clean.length)).toUpperCase();
}
