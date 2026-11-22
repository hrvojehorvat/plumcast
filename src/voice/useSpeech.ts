import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  RecognizerIntentExtraLanguageModel,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import type { Lang } from '../core/i18n';

/**
 * Plum's ears: one spoken sentence → text, with the device's own speech recognition (Android's
 * SpeechRecognizer; the browser's Web Speech API on web). Free, nothing of ours on a server.
 * Fire TV has no recognizer: `speechAvailable()` is false there and Plum stays hidden.
 */

export type SpeechState = 'idle' | 'listening' | 'done' | 'error';
/** What went wrong, in words the UI can explain. */
export type SpeechProblem = 'unavailable' | 'permission' | 'no-speech' | 'network' | 'language' | 'busy' | 'other';

/** Locale asked from the recognizer for each app language. */
export const SPEECH_LOCALE: Record<Lang, string> = { en: 'en-US', de: 'de-DE', hr: 'hr-HR' };

/** Most alternatives asked for one sentence (the parser tries them in order). */
const ALTERNATIVES = 3;
/** Silence that ends the sentence. A bit longer than Android's default: people pause before a title. */
const SILENCE_MS = 1500;

export function speechAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

function problemFor(code: ExpoSpeechRecognitionErrorCode): SpeechProblem {
  switch (code) {
    case 'not-allowed':
      return 'permission';
    case 'service-not-allowed':
      return 'unavailable';
    case 'no-speech':
    case 'speech-timeout':
      return 'no-speech';
    case 'network':
      return 'network';
    case 'language-not-supported':
      return 'language';
    case 'busy':
    case 'too-many-requests':
      return 'busy';
    default:
      return 'other';
  }
}

export interface Speech {
  state: SpeechState;
  /** What was heard so far (live while speaking), the best guess. */
  heard: string;
  problem: SpeechProblem | null;
  start: () => Promise<void>;
  /** Ends listening and keeps what was heard (it still arrives as the final result). */
  stop: () => void;
  /** Ends listening and drops everything. */
  cancel: () => void;
}

/**
 * Listens for one sentence. `onFinal` gets the alternatives, best first, once the sentence is
 * over; it is called at most once per `start()`.
 */
export function useSpeech(lang: Lang, onFinal: (alternatives: string[]) => void): Speech {
  const [state, setState] = useState<SpeechState>('idle');
  const [heard, setHeard] = useState('');
  const [problem, setProblem] = useState<SpeechProblem | null>(null);
  const finalRef = useRef(onFinal);
  const delivered = useRef(false);
  const active = useRef(false);

  useEffect(() => {
    finalRef.current = onFinal;
  }, [onFinal]);

  const fail = (next: SpeechProblem) => {
    active.current = false;
    setProblem(next);
    setState('error');
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (!active.current) return;
    const alternatives = event.results.map((r) => r.transcript.trim()).filter(Boolean);
    if (!alternatives.length) return;
    setHeard(alternatives[0]);
    if (event.isFinal && !delivered.current) {
      delivered.current = true;
      active.current = false;
      setState('done');
      finalRef.current(alternatives.slice(0, ALTERNATIVES));
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (!active.current || event.error === 'aborted') return;
    fail(problemFor(event.error));
  });
  useSpeechRecognitionEvent('nomatch', () => {
    if (active.current) fail('no-speech');
  });
  useSpeechRecognitionEvent('end', () => {
    // Ended without a final result and without an error: nothing was said.
    if (active.current && !delivered.current) fail('no-speech');
  });

  const start = useCallback(async () => {
    if (!speechAvailable()) return fail('unavailable');
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) return fail('permission');
    } catch {
      return fail('permission');
    }
    delivered.current = false;
    active.current = true;
    setHeard('');
    setProblem(null);
    setState('listening');
    try {
      ExpoSpeechRecognitionModule.start({
        lang: SPEECH_LOCALE[lang],
        interimResults: true,
        maxAlternatives: ALTERNATIVES,
        continuous: false,
        addsPunctuation: false,
        androidIntentOptions: {
          // Short phrases with names, like a search box, rather than dictation.
          EXTRA_LANGUAGE_MODEL: RecognizerIntentExtraLanguageModel.LANGUAGE_MODEL_WEB_SEARCH,
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: SILENCE_MS,
        },
      });
    } catch (error) {
      console.warn('[plum] speech recognition did not start', error instanceof Error ? error.message : error);
      fail('other');
    }
  }, [lang]);

  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Already stopped.
    }
  }, []);

  const cancel = useCallback(() => {
    active.current = false;
    setState('idle');
    setHeard('');
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Already stopped.
    }
  }, []);

  // Leaving the screen stops the microphone.
  useEffect(
    () => () => {
      if (!active.current) return;
      active.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Already stopped.
      }
    },
    [],
  );

  return { state, heard, problem, start, stop, cancel };
}
