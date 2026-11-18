export const en = {
  'nav.home': 'Home',
  'nav.live': 'Live TV',
  'nav.guide': 'TV guide',
  'nav.movies': 'Movies',
  'nav.series': 'Series',
  'nav.catchup': 'Catch-up',
  'nav.search': 'Search',
  'nav.settings': 'Settings',
  'nav.more': 'More',
  'tab.live': 'Live',
  'tab.guide': 'Guide',
  'common.comingSoon': 'Coming soon',
  'home.intro': 'Your playlists, live TV, replays, movies and series in one place.',
  'home.noContent': "Plumcast doesn't include any channels. Add a playlist from your IPTV provider to start.",
  'screen.live': 'Channels by category, with what is on now and next.',
  'screen.guide': 'The programme grid for all your channels.',
  'screen.movies': 'Browse, resume and favourite movies.',
  'screen.series': 'Seasons and episodes, with resume.',
  'screen.catchup': 'Replays of past programmes on channels that keep an archive.',
  'screen.search': 'Search across live TV, movies, series and the guide.',
  'screen.settings': 'Playlists, language and playback options.',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
