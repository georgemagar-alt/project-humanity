export const languages = { de: 'Deutsch', en: 'English' } as const;
export const defaultLang: Lang = 'de';
export type Lang = keyof typeof languages;

// UI strings. Add a key to BOTH dictionaries. Long page copy lives in the
// page/view files themselves, not here.
export const ui = {
  de: {
    'site.name': 'Project Humanity',
    'site.tagline': 'Gemeinsam gegen extreme Armut in Afrika.',
    'nav.home': 'Start',
    'nav.about': 'Wer wir sind',
    'nav.work': 'Was wir tun',
    'nav.news': 'Aktuelles',
    'nav.events': 'Termine',
    'nav.donate': 'Spenden',
    'nav.join': 'Mitglied werden',
    'nav.contact': 'Kontakt',
    'nav.imprint': 'Impressum',
    'nav.privacy': 'Datenschutz',
    'donate.heading': 'Jetzt spenden',
    'donate.raised': 'gesammelt',
    'donate.of': 'von',
    'donate.needed': 'noch benötigt',
    'donate.goalReached': 'Ziel erreicht – danke!',
    'donate.donors': 'Unterstützer:innen',
    'donate.chooseAmount': 'Betrag wählen',
    'donate.customAmount': 'Anderer Betrag (€)',
    'donate.button': 'Mit PayPal spenden',
    'donate.processing': 'Zahlung wird verarbeitet …',
    'donate.thanksTitle': 'Vielen Dank für deine Spende!',
    'donate.thanksBody': 'Deine Unterstützung ist angekommen. Eine Bestätigung ist unterwegs zu dir.',
    'donate.error': 'Da ist etwas schiefgelaufen. Es wurde nichts abgebucht. Bitte versuche es erneut.',
    'donate.selectCampaign': 'Kampagne',
    'join.name': 'Name',
    'join.email': 'E-Mail',
    'join.phone': 'Telefon (optional)',
    'join.message': 'Nachricht (optional)',
    'join.submit': 'Anfrage senden',
    'join.sending': 'Wird gesendet …',
    'join.success': 'Danke! Deine Anfrage ist angekommen. Wir melden uns.',
    'join.error': 'Senden fehlgeschlagen. Bitte prüfe deine Eingaben und versuche es erneut.',
    'news.readMore': 'Weiterlesen',
    'news.empty': 'Noch keine Beiträge.',
    'events.empty': 'Zurzeit keine anstehenden Termine.',
    'events.past': 'Vergangene Termine',
    'events.upcoming': 'Anstehende Termine',
    'footer.rights': 'Alle Rechte vorbehalten.',
  },
  en: {
    'site.name': 'Project Humanity',
    'site.tagline': 'Together against extreme poverty in Africa.',
    'nav.home': 'Home',
    'nav.about': 'Who we are',
    'nav.work': 'What we do',
    'nav.news': 'News',
    'nav.events': 'Events',
    'nav.donate': 'Donate',
    'nav.join': 'Become a member',
    'nav.contact': 'Contact',
    'nav.imprint': 'Imprint',
    'nav.privacy': 'Privacy',
    'donate.heading': 'Donate now',
    'donate.raised': 'raised',
    'donate.of': 'of',
    'donate.needed': 'still needed',
    'donate.goalReached': 'Goal reached – thank you!',
    'donate.donors': 'supporters',
    'donate.chooseAmount': 'Choose an amount',
    'donate.customAmount': 'Other amount (€)',
    'donate.button': 'Donate with PayPal',
    'donate.processing': 'Processing payment …',
    'donate.thanksTitle': 'Thank you for your donation!',
    'donate.thanksBody': 'Your support has arrived. A confirmation is on its way to you.',
    'donate.error': 'Something went wrong. Nothing was charged. Please try again.',
    'donate.selectCampaign': 'Campaign',
    'join.name': 'Name',
    'join.email': 'Email',
    'join.phone': 'Phone (optional)',
    'join.message': 'Message (optional)',
    'join.submit': 'Send request',
    'join.sending': 'Sending …',
    'join.success': 'Thanks! We received your request and will be in touch.',
    'join.error': 'Sending failed. Please check your input and try again.',
    'news.readMore': 'Read more',
    'news.empty': 'No posts yet.',
    'events.empty': 'No upcoming events right now.',
    'events.past': 'Past events',
    'events.upcoming': 'Upcoming events',
    'footer.rights': 'All rights reserved.',
  },
} as const;

export type UIKey = keyof (typeof ui)['de'];

export function getLangFromUrl(url: URL): Lang {
  const seg = url.pathname.split('/')[1];
  return seg === 'en' ? 'en' : 'de';
}

export function useTranslations(lang: Lang) {
  return function t(key: UIKey): string {
    return ui[lang][key] ?? ui[defaultLang][key] ?? key;
  };
}

/** Prefix an internal path with the locale ("/" -> "/en"). */
export function localizePath(path: string, lang: Lang): string {
  const clean = path === '' ? '/' : path.startsWith('/') ? path : `/${path}`;
  if (lang === defaultLang) return clean;
  return clean === '/' ? '/en' : `/en${clean}`;
}

/** Given the current path, return the equivalent path in the other language. */
export function swapLangPath(pathname: string, target: Lang): string {
  const stripped = pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  return target === 'de' ? stripped : stripped === '/' ? '/en' : `/en${stripped}`;
}
