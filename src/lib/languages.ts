import type { Language } from '@/contexts/LanguageContext';

export interface LanguageOption {
  code: string;
  label: string;   // English name
  native: string;  // endonym
  /** The app UI is translated for these; others fall back to English but the
      preference is still stored. */
  supported?: boolean;
}

// Ordered: the four the UI supports first, then other common Indian languages
// (searchable). Selecting an unsupported one keeps an English UI but records the
// choice for the future.
export const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', native: 'English', supported: true },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', supported: true },
  { code: 'bn', label: 'Bengali', native: 'বাংলা', supported: true },
  { code: 'as', label: 'Assamese', native: 'অসমীয়া', supported: true },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'or', label: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'ur', label: 'Urdu', native: 'اردو' },
  { code: 'sa', label: 'Sanskrit', native: 'संस्कृतम्' },
  { code: 'ne', label: 'Nepali', native: 'नेपाली' },
  { code: 'sd', label: 'Sindhi', native: 'سنڌي' },
  { code: 'ks', label: 'Kashmiri', native: 'कॉशुर' },
  { code: 'kok', label: 'Konkani', native: 'कोंकणी' },
  { code: 'mai', label: 'Maithili', native: 'मैथिली' },
  { code: 'doi', label: 'Dogri', native: 'डोगरी' },
  { code: 'mni', label: 'Manipuri', native: 'মৈতৈলোন্' },
  { code: 'sat', label: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ' },
  { code: 'brx', label: 'Bodo', native: 'बड़ो' },
];

const UI_LANGS = new Set(['en', 'hi', 'as', 'bn']);

/** The app-applied Language for a chosen code (unsupported → English UI). */
export function toAppLanguage(code: string): Language {
  return (UI_LANGS.has(code) ? code : 'en') as Language;
}
