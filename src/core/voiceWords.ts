import type { Lang } from './i18n';

/**
 * Plum's vocabulary: only words, grouped by meaning, per language. Write them as people say them
 * (with č, ž, ö, ß…); the parser folds them like search does, so "jučer" also matches "jucer".
 * Order inside a list doesn't matter (longer phrases are tried first). Lower-case, no punctuation
 * ("let's" → "lets", "o'clock" → "oclock").
 */

export type Words = Readonly<Record<Lang, readonly string[]>>;

export type Screen = 'home' | 'live' | 'movies' | 'series' | 'catchup' | 'guide' | 'search' | 'settings';
export type TimeOfDay = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
export type Prefer = 'live' | 'catchup' | 'movie' | 'series';

// ---------------------------------------------------------------- around the sentence

/** The assistant's name, as speech recognition may hear it (only at the start). */
export const WAKE_NAMES: readonly string[] = ['plum', 'plam', 'plumm', 'plom', 'plumb', 'plumi'];

export const WAKE_GREETINGS: Words = {
  en: ['hey', 'hi', 'hello', 'ok', 'okay', 'yo'],
  de: ['hey', 'hallo', 'hi', 'ok', 'okay', 'he'],
  hr: ['hej', 'ej', 'bok', 'halo', 'ok', 'okej'],
};

/** Removed anywhere in the sentence. */
export const POLITE: Words = {
  en: ['please', 'pls', 'thank you', 'thanks'],
  de: ['bitte', 'bitte schön', 'danke', 'gerne', 'mal'],
  hr: ['molim', 'molim te', 'molim vas', 'hvala', 'ako može', 'ajde', 'hajde'],
};

/** Requests and play verbs before the title ("could you play me …"). */
export const LEAD: Words = {
  en: [
    'can you', 'could you', 'would you', 'will you', 'can i', 'could i', 'i want', 'i need',
    'i want to watch', 'i want to see', 'i would like to watch', 'i would like to see', 'id like to watch', 'id like to see',
    'i wanna watch', 'i wanna see', 'lets watch', 'let me watch', 'let me see', 'give me',
    'play', 'put on', 'watch', 'show me', 'show', 'start', 'turn on',
    'switch to', 'change to', 'go to', 'tune to', 'tune in to', 'resume', 'continue',
    'me', 'for me', 'us',
  ],
  de: [
    'kannst du', 'könntest du', 'würdest du', 'kann ich', 'ich möchte', 'ich möchte gerne', 'ich möchte gern',
    'ich will', 'ich würde gerne', 'ich hätte gerne', 'ich hätte gern', 'lass uns', 'lass mich', 'gib mir',
    'spiel', 'spiele', 'spiel ab', 'zeig mir', 'zeige mir', 'zeig', 'zeige', 'starte', 'start',
    'schalte auf', 'schalte um auf', 'schalte', 'wechsle zu', 'wechsel auf', 'geh auf', 'schau', 'mach', 'mach an',
    'mir', 'uns',
  ],
  hr: [
    'možeš li', 'možete li', 'mogu li', 'hoću gledati', 'hoću pogledati', 'želim gledati', 'želim pogledati',
    'bih gledao', 'bih gledala', 'htio bih gledati', 'htjela bih gledati', 'htio bih', 'htjela bih', 'hoću', 'želim',
    'daj mi', 'daj', 'ajmo gledati', 'pusti', 'pusti mi', 'stavi', 'stavi mi', 'prikaži', 'prikaži mi',
    'pokaži', 'pokaži mi', 'pokreni', 'upali', 'prebaci na', 'prebaci', 'mi', 'nam',
  ],
};

/** Verbs and fillers after the title ("… sehen", "… gledati"). */
export const TRAIL: Words = {
  en: ['please', 'now', 'for me', 'again'],
  de: ['sehen', 'schauen', 'anschauen', 'ansehen', 'gucken', 'angucken', 'abspielen', 'an', 'ab', 'bitte', 'jetzt'],
  hr: ['gledati', 'pogledati', 'molim', 'sada', 'sad'],
};

// ---------------------------------------------------------------- screens

export const OPEN_VERBS: Words = {
  en: ['open', 'go to', 'go back to', 'back to', 'take me to', 'bring me to', 'show', 'show me', 'switch to', 'navigate to', 'jump to'],
  de: ['öffne', 'öffnen', 'geh zu', 'gehe zu', 'geh zur', 'gehe zur', 'geh zum', 'gehe zum', 'geh auf', 'geh in', 'gehe in', 'zeig', 'zeige', 'zeig mir', 'zeige mir', 'wechsle zu', 'zurück zu', 'bring mich zu'],
  hr: ['otvori', 'idi na', 'idi u', 'vrati na', 'vrati se na', 'prikaži', 'pokaži', 'prebaci na', 'odvedi me na', 'skoči na'],
};

/** Between the verb and the screen ("open *the* guide"). */
export const OPEN_ARTICLES: Words = {
  en: ['the', 'my'],
  de: ['die', 'den', 'das', 'meine', 'zu', 'zur', 'zum'],
  hr: ['mi', 'moje', 'moj', 'moju'],
};

/** After the screen ("the guide *page*"). */
export const PAGE_WORDS: Words = {
  en: ['screen', 'page', 'menu', 'section', 'tab', 'list'],
  de: ['seite', 'bereich', 'menü', 'bildschirm', 'liste', 'übersicht'],
  hr: ['stranica', 'stranicu', 'izbornik', 'ekran', 'zaslon', 'popis', 'listu', 'sekciju', 'dio'],
};

export const SCREENS: Readonly<Record<Screen, Words>> = {
  home: {
    en: ['home', 'home screen', 'start', 'start screen', 'main menu', 'main screen', 'beginning'],
    de: ['start', 'startseite', 'home', 'hauptmenü', 'anfang'],
    hr: ['početna', 'početnu', 'početak', 'naslovna', 'naslovnu', 'glavni izbornik', 'home'],
  },
  live: {
    en: ['live tv', 'live', 'tv', 'television', 'channels', 'channel list', 'live channels', 'tv channels'],
    de: ['live tv', 'live', 'fernsehen', 'tv', 'sender', 'senderliste', 'kanäle'],
    hr: ['uživo', 'tv uživo', 'televizija', 'televiziju', 'tv', 'kanali', 'kanale', 'programi', 'programe', 'popis kanala'],
  },
  movies: {
    en: ['movies', 'movie', 'films', 'film', 'cinema', 'video on demand', 'vod'],
    de: ['filme', 'film', 'kino', 'spielfilme', 'videothek'],
    hr: ['filmovi', 'filmove', 'film', 'kino', 'videoteka', 'videoteku'],
  },
  series: {
    en: ['series', 'tv series', 'shows', 'tv shows', 'box sets'],
    de: ['serien', 'serie', 'tv serien'],
    hr: ['serije', 'seriju', 'serija', 'tv serije'],
  },
  catchup: {
    en: ['catch up', 'catchup', 'catch up tv', 'replay', 'replays', 'archive', 'recordings', 'past shows', 'missed shows', 'timeshift'],
    de: ['mediathek', 'wiederholungen', 'wiederholung', 'archiv', 'aufzeichnungen', 'verpasste sendungen', 'zeitversetzt', 'catch up', 'nachholen'],
    hr: ['nadoknadi', 'nadoknada', 'propušteno', 'propuštene emisije', 'unatrag', 'arhiva', 'arhivu', 'snimke', 'reprize', 'gledaj unatrag', 'catch up'],
  },
  guide: {
    en: ['tv guide', 'guide', 'epg', 'programme guide', 'program guide', 'schedule', 'tv schedule', 'listings', 'tv listings', 'whats on'],
    de: ['tv programm', 'programm', 'programmführer', 'programmzeitschrift', 'fernsehprogramm', 'epg', 'guide', 'sendeplan', 'was läuft'],
    hr: ['tv vodič', 'vodič', 'tv program', 'tv raspored', 'raspored', 'program', 'epg', 'što ide', 'šta ide'],
  },
  search: {
    en: ['search', 'find', 'search screen'],
    de: ['suche', 'suchen'],
    hr: ['pretraga', 'pretragu', 'tražilica', 'tražilicu', 'traži'],
  },
  settings: {
    en: ['settings', 'options', 'preferences', 'setup', 'configuration'],
    de: ['einstellungen', 'optionen', 'konfiguration'],
    hr: ['postavke', 'podešavanja', 'opcije', 'konfiguracija', 'konfiguraciju'],
  },
};

// ---------------------------------------------------------------- other commands

/** "Refresh the guide" needs one word from each list. */
export const REFRESH_VERBS: Words = {
  en: ['refresh', 'update', 'reload', 'sync', 'resync', 'download', 'fetch', 'renew', 'get the latest', 'get new'],
  de: ['aktualisiere', 'aktualisieren', 'aktualisier', 'neu laden', 'lade neu', 'lade', 'laden', 'herunterladen', 'synchronisiere', 'synchronisieren', 'erneuere', 'erneuern', 'hol', 'hole'],
  hr: ['osvježi', 'osvježiti', 'ažuriraj', 'ažurirati', 'obnovi', 'obnoviti', 'učitaj', 'učitaj ponovo', 'preuzmi', 'skini', 'sinkroniziraj', 'povuci'],
};
export const REFRESH_NOUNS: Words = {
  en: ['tv guide', 'guide', 'epg', 'programme guide', 'program guide', 'schedule', 'listings', 'programme data', 'xmltv'],
  de: ['tv programm', 'programm', 'programmführer', 'fernsehprogramm', 'epg', 'guide', 'programmdaten', 'sendeplan'],
  hr: ['tv vodič', 'vodič', 'tv program', 'program', 'raspored', 'epg', 'programsku shemu'],
};

export const SEARCH_VERBS: Words = {
  en: ['search for', 'search', 'look for', 'look up', 'find', 'find me', 'search the guide for'],
  de: ['suche nach', 'such nach', 'suche', 'such', 'finde', 'finde mir', 'such mir'],
  hr: ['potraži', 'traži', 'pronađi', 'nađi', 'pretraži'],
};

/** The whole rest of the sentence pointing at the focused item ("play *that*"). */
export const THAT: Words = {
  en: ['that', 'this', 'it', 'that one', 'this one', 'the selected one', 'the highlighted one', 'selected', 'what i selected'],
  de: ['das', 'das da', 'dies', 'dieses', 'diesen', 'diese', 'den da', 'die da', 'das hier', 'den hier', 'die hier', 'markierte', 'das ausgewählte', 'ausgewählte'],
  hr: ['to', 'ovo', 'ono', 'taj', 'tu', 'ovaj', 'ovu', 'označeno', 'odabrano', 'taj tamo', 'ovo ovdje'],
};

/** Before a number from Plum's list ("*number* 2"). */
export const INDEX_WORDS: Words = {
  en: ['number', 'no', 'nr', 'item', 'option', 'position'],
  de: ['nummer', 'nr', 'punkt', 'eintrag', 'option'],
  hr: ['broj', 'stavku', 'stavka', 'opciju', 'opcija'],
};
/** After an ordinal ("the second *one*"). */
export const ORDINAL_TAILS: Words = {
  en: ['one', 'option', 'item'],
  de: ['eintrag', 'film', 'sendung', 'option'],
  hr: ['film', 'emisiju', 'opciju', 'stavku'],
};

export const NUMBERS: Readonly<Record<Lang, Readonly<Record<string, number>>>> = {
  en: { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 },
  de: { eins: 1, ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12 },
  hr: { jedan: 1, jedna: 1, jedno: 1, dva: 2, dvije: 2, tri: 3, četiri: 4, pet: 5, šest: 6, sedam: 7, osam: 8, devet: 9, deset: 10, jedanaest: 11, dvanaest: 12 },
};

export const ORDINALS: Readonly<Record<Lang, Readonly<Record<string, number>>>> = {
  en: { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, last: -1 },
  de: {
    erste: 1, ersten: 1, erster: 1, erstes: 1, zweite: 2, zweiten: 2, zweiter: 2, dritte: 3, dritten: 3,
    vierte: 4, vierten: 4, fünfte: 5, fünften: 5, sechste: 6, letzte: -1, letzten: -1,
  },
  hr: {
    prvi: 1, prva: 1, prvo: 1, prvu: 1, drugi: 2, druga: 2, drugo: 2, drugu: 2, treći: 3, treća: 3, treće: 3, treću: 3,
    četvrti: 4, četvrta: 4, četvrtu: 4, peti: 5, peta: 5, petu: 5, šesti: 6, zadnji: -1, zadnju: -1, posljednji: -1,
  },
};

export const SEASON_WORDS: Words = {
  en: ['season'],
  de: ['staffel'],
  hr: ['sezona', 'sezone', 'sezonu', 'sezoni'],
};
export const EPISODE_WORDS: Words = {
  en: ['episode', 'ep', 'part'],
  de: ['folge', 'episode', 'teil'],
  hr: ['epizoda', 'epizodu', 'epizode', 'nastavak'],
};

// ---------------------------------------------------------------- when it aired

/** Day words, optionally with the part of the day they imply ("last night"). */
export const DAYS: readonly { offset: number; part?: TimeOfDay; words: Words }[] = [
  { offset: -7, words: { en: ['a week ago', 'one week ago'], de: ['vor einer woche'], hr: ['prije tjedan dana', 'prije sedmicu dana'] } },
  {
    offset: -2,
    words: {
      en: ['the day before yesterday', 'day before yesterday'],
      de: ['vorgestern', 'vorgestrige', 'vorgestrigen'],
      hr: ['prekjučer', 'prekjuče', 'prekjučerašnji', 'prekjučerašnju'],
    },
  },
  { offset: -1, part: 'night', words: { en: ['last night'], de: ['letzte nacht'], hr: ['sinoć', 'sinoćnji', 'sinoćnju', 'sinoćnja'] } },
  { offset: -1, part: 'morning', words: { en: [], de: ['gestern morgen', 'gestern früh'], hr: [] } },
  { offset: 0, part: 'evening', words: { en: ['tonight', 'this evening'], de: ['heute abend'], hr: ['večeras', 'večerašnji', 'večerašnju'] } },
  { offset: 0, part: 'morning', words: { en: ['this morning'], de: ['heute morgen', 'heute früh'], hr: ['jutros', 'jutrošnji', 'jutrošnju'] } },
  { offset: 0, part: 'afternoon', words: { en: ['this afternoon'], de: [], hr: [] } },
  {
    offset: -1,
    words: {
      en: ['yesterday', 'yesterdays'],
      de: ['gestern', 'gestrige', 'gestrigen', 'gestriges'],
      hr: ['jučer', 'juče', 'jučerašnji', 'jučerašnju', 'jučerašnja', 'jučerašnje'],
    },
  },
  {
    offset: 0,
    words: {
      en: ['today', 'todays', 'earlier today', 'earlier'],
      de: ['heute', 'heutige', 'heutigen', 'vorhin'],
      hr: ['danas', 'današnji', 'današnju', 'današnja', 'maloprije', 'ranije danas'],
    },
  },
];

/** "3 days ago" / "vor 3 Tagen" / "prije 3 dana": the words around the number. */
export const DAYS_AGO: readonly { before: string; after: string }[] = [
  { before: '', after: 'days ago' },
  { before: '', after: 'day ago' },
  { before: 'vor', after: 'tagen' },
  { before: 'prije', after: 'dana' },
];

/** Sunday first, like `Date.getDay()`. Croatian also in the cases people use ("u subotu", "od petka"). */
export const WEEKDAYS: readonly Words[] = [
  { en: ['sunday', 'sundays'], de: ['sonntag', 'sonntags'], hr: ['nedjelja', 'nedjelju', 'nedjelje', 'nedelja', 'nedelju'] },
  { en: ['monday', 'mondays'], de: ['montag', 'montags'], hr: ['ponedjeljak', 'ponedjeljka', 'ponedeljak', 'ponedeljka'] },
  { en: ['tuesday', 'tuesdays'], de: ['dienstag', 'dienstags'], hr: ['utorak', 'utorka'] },
  { en: ['wednesday', 'wednesdays'], de: ['mittwoch', 'mittwochs'], hr: ['srijeda', 'srijedu', 'srijede', 'sreda', 'sredu'] },
  { en: ['thursday', 'thursdays'], de: ['donnerstag', 'donnerstags'], hr: ['četvrtak', 'četvrtka'] },
  { en: ['friday', 'fridays'], de: ['freitag', 'freitags'], hr: ['petak', 'petka'] },
  { en: ['saturday', 'saturdays'], de: ['samstag', 'samstags', 'sonnabend'], hr: ['subota', 'subotu', 'subote'] },
];

/** Before a weekday: a week back even when it's today ("last Saturday" on a Saturday). */
export const LAST_WORDS: Words = {
  en: ['last', 'past', 'previous', 'this past'],
  de: ['letzten', 'letzte', 'letzter', 'letztes', 'vergangenen', 'vergangene', 'vorigen'],
  hr: ['prošli', 'prošle', 'prošlog', 'prošlu', 'prošla', 'prošlo'],
};

/** Small words in front of a time phrase that go with it ("*from* yesterday", "*am* Montag"). */
export const TIME_PREPOSITIONS: Words = {
  en: ['from', 'of', 'on', 'that was on', 'which aired', 'that aired', 'aired', 'at', 'around', 'about', 'sometime'],
  de: ['von', 'vom', 'am', 'um', 'gegen', 'ab'],
  hr: ['od', 'iz', 'u', 'oko', 's', 'sa'],
};

/**
 * Parts of the day with their hours [from, to) on a 0–24 clock (night runs past midnight, so up
 * to 29 = 05:00 next day). They overlap on purpose: they're search windows, not a strict clock.
 * Bare words ("morning") count only next to a day or clock time or at the end of the sentence,
 * since titles have them too ("Good Morning America"); phrases with a preposition
 * ("in the morning", "am Abend", "u podne") count anywhere.
 */
export const PARTS_OF_DAY: Readonly<Record<TimeOfDay, { hours: readonly [number, number]; words: Words }>> = {
  morning: {
    hours: [5, 12],
    words: {
      en: ['morning', 'in the morning', 'early morning', 'early in the morning', 'at breakfast', 'breakfast time'],
      de: ['morgens', 'vormittag', 'vormittags', 'früh', 'in der früh', 'frühmorgens', 'am morgen', 'am vormittag'],
      hr: ['ujutro', 'jutro', 'ujutru', 'prijepodne', 'jutarnji', 'jutarnju', 'rano ujutro', 'u jutro'],
    },
  },
  midday: {
    hours: [11, 15],
    words: {
      en: ['noon', 'midday', 'at noon', 'at midday', 'lunchtime', 'at lunchtime', 'lunch time'],
      de: ['mittag', 'mittags', 'zu mittag', 'am mittag', 'mittagszeit', 'um mittag'],
      hr: ['podne', 'u podne', 'oko podne', 'za ručak', 'u vrijeme ručka'],
    },
  },
  afternoon: {
    hours: [12, 18],
    words: {
      en: ['afternoon', 'in the afternoon'],
      de: ['nachmittag', 'nachmittags', 'am nachmittag'],
      hr: ['poslijepodne', 'popodne', 'poslije podne', 'popodnevni', 'popodnevnu', 'u popodnevnim satima'],
    },
  },
  evening: {
    hours: [17, 24],
    words: {
      en: ['evening', 'in the evening', 'prime time', 'primetime', 'in prime time'],
      de: ['abend', 'abends', 'am abend', 'hauptsendezeit', 'primetime', 'zur primetime'],
      hr: ['navečer', 'uvečer', 'večer', 'večernji', 'večernju', 'u večernjim satima', 'udarni termin', 'u udarnom terminu'],
    },
  },
  night: {
    hours: [19, 29],
    words: {
      en: ['night', 'at night', 'late at night', 'midnight', 'at midnight', 'overnight', 'in the night'],
      de: ['nacht', 'nachts', 'in der nacht', 'spätabends', 'spät abends', 'mitternacht', 'um mitternacht'],
      hr: ['noću', 'noć', 'po noći', 'kasno navečer', 'ponoć', 'u ponoć', 'oko ponoći', 'noćni', 'noćnu'],
    },
  },
};

/** "at 8", "um 20 Uhr", "u 20 sati", "8 o'clock". */
export const CLOCK_BEFORE: Words = {
  en: ['at', 'around', 'about', 'by', 'from'],
  de: ['um', 'gegen', 'ca', 'circa', 'ab'],
  hr: ['u', 'oko', 'otprilike u', 'od'],
};
export const CLOCK_AFTER: readonly string[] = ['am', 'pm', 'oclock', 'uhr', 'sati', 'sata', 'h', 'hrs'];

// ---------------------------------------------------------------- what kind of thing

/** Said before or after the title ("the movie X", "X live"). */
export const PREFER_WORDS: Readonly<Record<Prefer, Words>> = {
  live: {
    en: ['live', 'channel', 'the channel', 'tv channel', 'station', 'the station', 'live tv', 'stream', 'livestream'],
    de: ['live', 'sender', 'den sender', 'kanal', 'den kanal', 'programm', 'das programm', 'live tv', 'livestream'],
    hr: ['uživo', 'kanal', 'program', 'programa', 'postaja', 'postaju', 'tv kanal', 'live'],
  },
  catchup: {
    en: [
      'replay', 'the replay', 'play back', 'catch up', 'catchup', 'catch up tv', 'from catch up', 'from catchup', 'in catch up',
      'recording', 'the recording', 'rerun', 'watch again', 'from the archive', 'from the beginning', 'from the start',
    ],
    de: [
      'wiederholung', 'die wiederholung', 'aufzeichnung', 'die aufzeichnung', 'aus der mediathek', 'in der mediathek', 'mediathek',
      'nochmal', 'nochmal ansehen', 'von anfang an', 'catch up', 'aus dem archiv',
    ],
    hr: ['snimka', 'snimku', 'repriza', 'reprizu', 'ponovno', 'ispočetka', 'od početka', 'iz arhive', 'u arhivi', 'nadoknadi', 'nadoknada', 'catch up'],
  },
  movie: {
    en: ['movie', 'the movie', 'film', 'the film', 'feature film'],
    de: ['film', 'den film', 'spielfilm', 'den spielfilm', 'kinofilm', 'den kinofilm'],
    hr: ['film', 'filmu', 'igrani film', 'igrani'],
  },
  series: {
    en: ['series', 'the series', 'tv series', 'sitcom', 'the sitcom'],
    de: ['serie', 'die serie', 'tv serie', 'sitcom'],
    hr: ['serija', 'seriju', 'seriji', 'tv seriju', 'tv serija'],
  },
};

/** Fillers right before the title ("the latest episode of …"). */
export const BEFORE_TITLE: Words = {
  en: [
    'episode', 'the episode', 'an episode', 'latest episode', 'the latest episode', 'last episode', 'the last episode',
    'new episode', 'the new episode', 'newest episode', 'the newest episode', 'the show', 'show', 'programme', 'program', 'the programme',
  ],
  de: [
    'folge', 'die folge', 'eine folge', 'neue folge', 'die neue folge', 'letzte folge', 'die letzte folge', 'neueste folge',
    'die neueste folge', 'sendung', 'die sendung', 'die neue', 'die letzte',
  ],
  hr: ['epizoda', 'epizodu', 'zadnju epizodu', 'zadnja epizoda', 'novu epizodu', 'najnoviju epizodu', 'posljednju epizodu', 'emisija', 'emisiju', 'emisiji'],
};
/** Between that filler and the title ("episode *of* …"). */
export const OF_WORDS: readonly string[] = ['of', 'von', 'vom', 'od', 'iz'];

/** The user describes the programme instead of naming it: ask the AI fallback. */
export const VAGUE: Words = {
  en: ['something', 'anything', 'kind of', 'sort of', 'the one with', 'the one about', 'that thing'],
  de: ['irgendwas', 'irgendetwas', 'irgendeine', 'irgendein', 'etwas', 'was mit', 'so eine', 'sowas', 'die mit', 'das mit'],
  hr: ['nešto', 'bilo što', 'onu s', 'onu sa', 'onaj s', 'onaj sa', 'ono s', 'ono sa', 'nešto s', 'nešto sa', 'neku', 'neki'],
};
/** Pointing at a title without saying it ("*that* cooking show"). Only at the start. */
export const POINTING: Words = {
  en: ['that', 'this', 'the one', 'one of', 'those'],
  de: ['diese', 'dieser', 'diesen', 'dieses', 'jene', 'jenen', 'die eine', 'den einen'],
  hr: ['onu', 'onaj', 'ono', 'ona', 'to', 'ovu', 'ovaj', 'tu', 'taj'],
};

/** "… *on* RTL": the channel follows. */
export const CHANNEL_PREPOSITIONS: Words = {
  en: ['on'],
  de: ['auf', 'bei', 'im'],
  hr: ['na', 'sa'],
};
/** "on *channel* RTL", "*Sender* ZDF": the word for channel itself. */
export const CHANNEL_WORDS: Words = {
  en: ['channel', 'the channel', 'tv channel', 'station'],
  de: ['sender', 'dem sender', 'den sender', 'kanal', 'dem kanal'],
  hr: ['kanal', 'kanalu', 'tv kanal', 'program', 'programu', 'postaju', 'postaji'],
};

// ---------------------------------------------------------------- where to look for catch-up

/**
 * Words in category names per country (provider lists are grouped by country: "HR | Hrvatska",
 * "DE Deutschland", "EX-YU"). Plum searches the catch-up of matching categories first when a
 * country is said ("masterchef hrvatska") or the app is in that language.
 */
export const COUNTRIES: readonly { lang: Lang | null; said: readonly string[]; categories: readonly string[] }[] = [
  { lang: 'hr', said: ['hrvatska', 'hrvatski', 'hrvatsku', 'croatia', 'croatian', 'kroatien'], categories: ['hrvatska', 'croatia', 'hr', 'ex yu', 'exyu', 'balkan'] },
  { lang: null, said: ['srbija', 'serbia', 'serbien', 'srpski'], categories: ['srbija', 'serbia', 'rs', 'srb', 'ex yu', 'exyu', 'balkan'] },
  { lang: null, said: ['bosna', 'bih', 'bosnia', 'bosnien'], categories: ['bosna', 'bosnia', 'ba', 'bih', 'ex yu', 'exyu', 'balkan'] },
  { lang: null, said: ['slovenija', 'slovenia', 'slowenien'], categories: ['slovenija', 'slovenia', 'si', 'slo', 'ex yu', 'exyu'] },
  { lang: 'de', said: ['deutschland', 'germany', 'german', 'deutsch', 'njemacka', 'njemačka'], categories: ['deutschland', 'germany', 'de', 'ger'] },
  { lang: null, said: ['österreich', 'austria', 'austrija'], categories: ['österreich', 'austria', 'at'] },
  { lang: null, said: ['schweiz', 'switzerland', 'švicarska'], categories: ['schweiz', 'switzerland', 'ch'] },
  { lang: 'en', said: ['uk', 'british', 'england', 'britain'], categories: ['united kingdom', 'england', 'uk', 'gb'] },
  { lang: null, said: ['usa', 'america', 'american', 'amerika'], categories: ['united states', 'america', 'usa', 'us'] },
  { lang: null, said: ['australia', 'australian', 'australien', 'australija'], categories: ['australia', 'au'] },
];
