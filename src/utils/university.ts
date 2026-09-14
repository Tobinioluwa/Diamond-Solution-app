/**
 * Utility for formatting and normalizing university / institutional names.
 * Ensures the scholar's university is always written in full (e.g., "University of Ibadan")
 * rather than abbreviated or generic placeholders like "University".
 */

export const DEFAULT_UNIVERSITY = 'University of Ibadan';

const KNOWN_ACRONYMS: Record<string, string> = {
  'ui': 'University of Ibadan',
  'u.i': 'University of Ibadan',
  'u.i.': 'University of Ibadan',
  'ibadan': 'University of Ibadan',
  'unilag': 'University of Lagos',
  'u.l': 'University of Lagos',
  'lagos': 'University of Lagos',
  'oau': 'Obafemi Awolowo University',
  'ife': 'Obafemi Awolowo University',
  'uniben': 'University of Benin',
  'benin': 'University of Benin',
  'abu': 'Ahmadu Bello University',
  'zaria': 'Ahmadu Bello University',
  'unn': 'University of Nigeria, Nsukka',
  'nsukka': 'University of Nigeria, Nsukka',
  'unilorin': 'University of Ilorin',
  'ilorin': 'University of Ilorin',
  'futa': 'Federal University of Technology, Akure',
  'akure': 'Federal University of Technology, Akure',
  'futo': 'Federal University of Technology, Owerri',
  'owerri': 'Federal University of Technology, Owerri',
  'lasu': 'Lagos State University',
  'oou': 'Olabisi Onabanjo University',
  'eksu': 'Ekiti State University',
  'lautech': 'Ladoke Akintola University of Technology',
  'ogbomoso': 'Ladoke Akintola University of Technology',
  'unical': 'University of Calabar',
  'calabar': 'University of Calabar',
  'uniport': 'University of Port Harcourt',
  'port harcourt': 'University of Port Harcourt',
  'unijos': 'University of Jos',
  'jos': 'University of Jos',
  'uniabuja': 'University of Abuja',
  'abuja': 'University of Abuja',
  'buk': 'Bayero University Kano',
  'kano': 'Bayero University Kano',
  'udus': 'Usmanu Danfodiyo University, Sokoto',
  'mouau': 'Michael Okpara University of Agriculture, Umudike',
  'funaab': 'Federal University of Agriculture, Abeokuta',
  'abeokuta': 'Federal University of Agriculture, Abeokuta',
  'noun': 'National Open University of Nigeria',
  'bowen': 'Bowen University',
  'covenant': 'Covenant University',
  'babcock': 'Babcock University',
  'abuad': 'Afe Babalola University',
  'redeemers': "Redeemer's University"
};

const GENERIC_NAMES = new Set([
  'university',
  'the university',
  'my university',
  'univ',
  'uni',
  'institution',
  'institution name',
  'school',
  'college',
  'general',
  'n/a',
  'none',
  '-',
  '—'
]);

/**
 * Returns the university name in full, capitalized correctly.
 * If missing, placeholder, or generic "University", defaults to "University of Ibadan".
 */
export function formatUniversityName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') {
    return DEFAULT_UNIVERSITY;
  }

  const clean = raw.trim().replace(/^[\(\[\{]+|[\)\]\}]+$/g, '').trim();
  if (!clean) {
    return DEFAULT_UNIVERSITY;
  }

  const lower = clean.toLowerCase();

  // If generic placeholder like "University" or "institution", write in full as University of Ibadan
  if (GENERIC_NAMES.has(lower)) {
    return DEFAULT_UNIVERSITY;
  }

  // Check known abbreviations
  if (KNOWN_ACRONYMS[lower]) {
    return KNOWN_ACRONYMS[lower];
  }

  // If it starts with "ui " or ends with " ui"
  if (lower === 'u of i' || lower === 'u of ibadan') {
    return DEFAULT_UNIVERSITY;
  }

  // Title case formatting for full names (e.g. "university of ibadan" -> "University of Ibadan")
  const lowercaseWords = new Set(['of', 'and', 'in', 'the', 'for', 'at', 'on']);
  const words = clean.split(/\s+/);
  
  return words
    .map((word, idx) => {
      const wLower = word.toLowerCase();
      if (idx > 0 && lowercaseWords.has(wLower)) {
        return wLower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
