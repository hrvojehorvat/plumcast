import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseBest, parseCommand, type Heard } from '../core/voice';
import { syncGuide } from '../data/guide';
import { usePrefs } from '../data/prefs';
import { activePlaylist, usePlaylists } from '../data/store';
import { PlumCancelled, resolvePlay, warmUpPlum, type PlumTarget, type Resolution } from '../data/voice';
import { useI18n } from '../ui/i18n';
import { requestSearch } from '../ui/pendingOpen';
import { useLatest } from '../ui/useQuery';
import { plum } from './plum';
import { openScreen, playTarget } from './playTarget';
import { useSpeech, type SpeechProblem } from './useSpeech';

/** Where Plum is: listening, thinking about what was said, or showing the answer. */
export type PlumPhase =
  | { kind: 'listening' }
  | { kind: 'thinking'; heard: Heard }
  /** A play command with what was found (may be unsure: show the candidates). `searching`: more may come. */
  | { kind: 'found'; heard: Heard; resolution: Resolution; searching?: boolean }
  /** "Refresh the TV guide": the download runs; progress and result come from the guide state. */
  | { kind: 'refreshing'; heard: Heard; playlistId: number; startedAt: number }
  | { kind: 'not-understood'; heard: Heard }
  | { kind: 'not-found'; heard: Heard }
  | { kind: 'no-playlist'; heard: Heard }
  | { kind: 'problem'; problem: SpeechProblem };

export interface Plum {
  phase: PlumPhase;
  /** Live transcript while listening. */
  heard: string;
  listen: () => void;
  /** Ends listening early and uses what was heard. */
  stop: () => void;
  /** Closes Plum and plays a found item. */
  play: (target: PlumTarget) => void;
}

/** Listens as soon as it mounts (the panel opening is the "I'm talking now"). */
export function usePlum(): Plum {
  const { lang } = useI18n();
  const playlist = activePlaylist(usePlaylists());
  const { epgOffsetHours } = usePrefs();
  const [phase, setPhase] = useState<PlumPhase>({ kind: 'listening' });

  const play = useCallback(
    (target: PlumTarget) => {
      if (!playlist) return;
      plum.close();
      playTarget(playlist, target).catch((error: unknown) => console.warn('[plum] could not play', error instanceof Error ? error.message : error));
    },
    [playlist],
  );
  // Answers to an older question are dropped (spoke again while it was still looking).
  const run = useRef(0);
  /**
   * The search that runs now. Only one at a time: a new one (or speaking again, or closing Plum)
   * stops it, and waits until it has stopped before starting, so a slow TV box never has two
   * searches scanning the database and downloading archives at once.
   */
  const search = useRef<{ controller: AbortController; done: Promise<void> } | null>(null);
  const stopSearch = useCallback(() => search.current?.controller.abort(), []);

  // The sound-alike index builds while the user speaks.
  useEffect(() => {
    if (playlist) warmUpPlum(playlist);
  }, [playlist]);
  // Closing Plum stops a search that still runs.
  useEffect(() => stopSearch, [stopSearch]);

  const onFinal = useCallback(
    (alternatives: string[]) => {
      stopSearch();
      const id = ++run.current;
      const heard = parseBest(alternatives);
      const command = heard.command;
      if (!command) return setPhase({ kind: 'not-understood', heard });
      if (command.kind === 'open') {
        plum.close();
        return openScreen(command.screen);
      }
      if (command.kind === 'search') {
        plum.close();
        requestSearch(command.query);
        return openScreen('search');
      }
      // "Play that" needs the focused item: not in this version.
      if (command.kind === 'play-that') return setPhase({ kind: 'not-understood', heard });
      if (!playlist) return setPhase({ kind: 'no-playlist', heard });
      if (command.kind === 'refresh-epg') {
        setPhase({ kind: 'refreshing', heard, playlistId: playlist.id, startedAt: Date.now() });
        void syncGuide(playlist);
        return;
      }
      setPhase({ kind: 'thinking', heard });
      // The recognizer's other guesses, tried in order when the best one finds nothing ("wall e" after "volley").
      const others = alternatives
        .map((text) => ({ text, ...parseCommand(text) }))
        .filter((h) => h.command?.kind === 'play' && h.command.title !== command.title);
      const controller = new AbortController();
      const previous = search.current?.done ?? Promise.resolve();
      const options = {
        offsetHours: epgOffsetHours,
        lang,
        signal: controller.signal,
        // What the quick parts found, while the TV guide or the archives are still searched.
        onUpdate: (resolution: Resolution) => {
          if (id === run.current && resolution.best) setPhase({ kind: 'found', heard, resolution, searching: true });
        },
      };
      const tryEach = async (): Promise<{ heard: Heard; resolution: Resolution }> => {
        await previous;
        const first = await resolvePlay(playlist, command, options);
        if (first.best) return { heard, resolution: first };
        for (const other of others) {
          if (other.command?.kind !== 'play' || controller.signal.aborted) continue;
          const resolution = await resolvePlay(playlist, other.command, options);
          if (resolution.best) return { heard: other, resolution };
        }
        return { heard, resolution: first };
      };
      const done = tryEach()
        .then(({ heard: used, resolution }) => {
          if (id !== run.current || controller.signal.aborted) return;
          // Sure: play it at once. Unsure: show the choices.
          if (resolution.best && resolution.sure) return play(resolution.best);
          setPhase(resolution.best ? { kind: 'found', heard: used, resolution } : { kind: 'not-found', heard });
        })
        .catch((error: unknown) => {
          if (error instanceof PlumCancelled) return;
          console.warn('[plum] search failed', error instanceof Error ? error.message : error);
          if (id === run.current) setPhase({ kind: 'not-found', heard });
        });
      search.current = { controller, done };
    },
    [playlist, epgOffsetHours, lang, play, stopSearch],
  );

  const speech = useSpeech(lang, onFinal);
  const { start } = speech;

  const listen = useCallback(() => {
    // Speaking again stops the search that still runs.
    stopSearch();
    run.current++;
    setPhase({ kind: 'listening' });
    void start();
  }, [start, stopSearch]);

  // Only when the panel opens; later listens come from "Speak again".
  const firstListen = useLatest(listen);
  useEffect(() => firstListen.current(), [firstListen]);

  // A speech problem ends listening and is what's shown.
  const problem = speech.state === 'error' ? speech.problem : null;
  const shown = useMemo<PlumPhase>(() => (problem ? { kind: 'problem', problem } : phase), [problem, phase]);

  return { phase: shown, heard: speech.heard, listen, stop: speech.stop, play };
}
