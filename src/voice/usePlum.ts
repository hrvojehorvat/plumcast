import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseBest, type Heard } from '../core/voice';
import { usePrefs } from '../data/prefs';
import { activePlaylist, usePlaylists } from '../data/store';
import { resolvePlay, type Resolution } from '../data/voice';
import { useI18n } from '../ui/i18n';
import { useLatest } from '../ui/useQuery';
import { useSpeech, type SpeechProblem } from './useSpeech';

/** Where Plum is: listening, thinking about what was said, or showing the answer. */
export type PlumPhase =
  | { kind: 'listening' }
  | { kind: 'thinking'; heard: Heard }
  /** A play command with what was found (may be unsure: show the candidates). */
  | { kind: 'found'; heard: Heard; resolution: Resolution }
  /** Understood, not a play command (open a screen, refresh the guide, search, play that). */
  | { kind: 'command'; heard: Heard }
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
}

/** Listens as soon as it mounts (the panel opening is the "I'm talking now"). */
export function usePlum(): Plum {
  const { lang } = useI18n();
  const playlist = activePlaylist(usePlaylists());
  const { epgOffsetHours } = usePrefs();
  const [phase, setPhase] = useState<PlumPhase>({ kind: 'listening' });
  // Answers to an older question are dropped (spoke again while it was still looking).
  const run = useRef(0);

  const onFinal = useCallback(
    (alternatives: string[]) => {
      const id = ++run.current;
      const heard = parseBest(alternatives);
      const command = heard.command;
      if (!command) return setPhase({ kind: 'not-understood', heard });
      if (command.kind !== 'play') return setPhase({ kind: 'command', heard });
      if (!playlist) return setPhase({ kind: 'no-playlist', heard });
      setPhase({ kind: 'thinking', heard });
      resolvePlay(playlist, command, { offsetHours: epgOffsetHours })
        .then((resolution) => {
          if (id !== run.current) return;
          setPhase(resolution.best ? { kind: 'found', heard, resolution } : { kind: 'not-found', heard });
        })
        .catch((error: unknown) => {
          console.warn('[plum] search failed', error instanceof Error ? error.message : error);
          if (id === run.current) setPhase({ kind: 'not-found', heard });
        });
    },
    [playlist, epgOffsetHours],
  );

  const speech = useSpeech(lang, onFinal);
  const { start } = speech;

  const listen = useCallback(() => {
    run.current++;
    setPhase({ kind: 'listening' });
    void start();
  }, [start]);

  // Only when the panel opens; later listens come from "Speak again".
  const firstListen = useLatest(listen);
  useEffect(() => firstListen.current(), [firstListen]);

  // A speech problem ends listening and is what's shown.
  const problem = speech.state === 'error' ? speech.problem : null;
  const shown = useMemo<PlumPhase>(() => (problem ? { kind: 'problem', problem } : phase), [problem, phase]);

  return { phase: shown, heard: speech.heard, listen, stop: speech.stop };
}
