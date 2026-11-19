import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { webPlayerFor } from '../core/streams';
import { routeUrl } from '../data/net';
import { useLatest } from '../ui/useQuery';
import type { VideoProps } from './types';

// mpegts.js logs every parser hiccup with console.error, which the dev overlay pops up on
// screen. Our own error handler below reports what matters (console.warn), so keep it quiet.
mpegts.LoggingControl.applyConfig({
  enableAll: false,
  enableDebug: false,
  enableVerbose: false,
  enableInfo: false,
  enableWarn: false,
  enableError: false,
});

/**
 * Browser playback (dev testing). MPEG-TS goes through mpegts.js, HLS through hls.js (or
 * natively in Safari); both feed a plain <video> via Media Source Extensions.
 */
export function Video({ url, muted, live = true, paused, style, onPlaying, onBuffering, onError, onProgress, onEnd, startAt, seek, onDuration }: VideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const callbacks = useLatest({ onPlaying, onBuffering, onError, onProgress, onEnd, onDuration });
  const pausedRef = useLatest(paused);
  const startRef = useLatest(startAt);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const src = routeUrl(url);
    const fail = (message: string) => {
      console.warn('[player]', message.replace(/https?:\/\/\S+/g, '(link)'));
      callbacks.current.onError?.(message);
    };
    let destroy = () => undefined as void;

    const kind = webPlayerFor(url);
    if (kind === 'mpegts' && mpegts.isSupported()) {
      // Replays are read as one continuous stream too: timeshift links ignore byte ranges, so
      // mpegts.js's chunked loading would get misaligned data. Seeking builds a new link instead.
      const player = mpegts.createPlayer(
        { type: 'mpegts', isLive: true, url: src },
        live ? { enableStashBuffer: false, liveBufferLatencyChasing: true, lazyLoad: false } : { lazyLoad: false, liveBufferLatencyChasing: false },
      );
      player.on(mpegts.Events.ERROR, (type: string, detail: string) => fail(`${type}: ${detail}`));
      player.attachMediaElement(el);
      player.load();
      destroy = () => {
        player.pause();
        player.unload();
        player.detachMediaElement();
        player.destroy();
      };
    } else if (kind === 'hls' && Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: false });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) fail(`${data.type}: ${data.details}`);
      });
      hls.loadSource(src);
      hls.attachMedia(el);
      destroy = () => hls.destroy();
    } else {
      el.src = src;
      destroy = () => {
        el.removeAttribute('src');
        el.load();
      };
    }

    // Autoplay with sound needs a recent key press or click; fall back to muted.
    const play = () =>
      el.play().catch(() => {
        el.muted = true;
        return el.play().catch(() => undefined);
      });
    if (!pausedRef.current) void play();

    const onPlayingEvt = () => {
      callbacks.current.onBuffering?.(false);
      callbacks.current.onPlaying?.();
    };
    const onWaiting = () => callbacks.current.onBuffering?.(true);
    const onMediaError = () => fail(el.error?.message || `Media error ${el.error?.code ?? ''}`);
    const onTime = () => callbacks.current.onProgress?.(el.currentTime);
    const onEnded = () => callbacks.current.onEnd?.();
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) callbacks.current.onDuration?.(el.duration);
      const start = startRef.current;
      if (start && start > 0 && !live) el.currentTime = start;
    };
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('playing', onPlayingEvt);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('error', onMediaError);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('playing', onPlayingEvt);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('error', onMediaError);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('loadedmetadata', onMeta);
      destroy();
    };
  }, [url, live, callbacks, pausedRef, startRef]);

  useEffect(() => {
    const el = ref.current;
    if (el && seek && Number.isFinite(seek.seconds)) el.currentTime = Math.max(0, seek.seconds);
  }, [seek]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (paused) el.pause();
    else if (el.paused && el.currentSrc) void el.play().catch(() => undefined);
  }, [paused]);

  useEffect(() => {
    if (ref.current) ref.current.muted = !!muted;
  }, [muted]);

  return (
    <View style={[{ backgroundColor: '#000', overflow: 'hidden' }, style]}>
      <video ref={ref} playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }} />
    </View>
  );
}
