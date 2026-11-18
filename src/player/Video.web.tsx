import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { webPlayerFor } from '../core/streams';
import { routeUrl } from '../data/net';
import { useLatest } from '../ui/useQuery';
import type { VideoProps } from './types';

/**
 * Browser playback (dev testing). MPEG-TS goes through mpegts.js, HLS through hls.js (or
 * natively in Safari); both feed a plain <video> via Media Source Extensions.
 */
export function Video({ url, muted, style, onPlaying, onBuffering, onError }: VideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const callbacks = useLatest({ onPlaying, onBuffering, onError });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const src = routeUrl(url);
    const fail = (message: string) => callbacks.current.onError?.(message);
    let destroy = () => undefined as void;

    const kind = webPlayerFor(url);
    if (kind === 'mpegts' && mpegts.isSupported()) {
      const player = mpegts.createPlayer(
        { type: 'mpegts', isLive: true, url: src },
        { enableStashBuffer: false, liveBufferLatencyChasing: true, lazyLoad: false },
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
    void play();

    const onPlayingEvt = () => {
      callbacks.current.onBuffering?.(false);
      callbacks.current.onPlaying?.();
    };
    const onWaiting = () => callbacks.current.onBuffering?.(true);
    const onMediaError = () => fail(el.error?.message || `Media error ${el.error?.code ?? ''}`);
    el.addEventListener('playing', onPlayingEvt);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('error', onMediaError);
    return () => {
      el.removeEventListener('playing', onPlayingEvt);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('error', onMediaError);
      destroy();
    };
  }, [url, callbacks]);

  useEffect(() => {
    if (ref.current) ref.current.muted = !!muted;
  }, [muted]);

  return (
    <View style={[{ backgroundColor: '#000', overflow: 'hidden' }, style]}>
      <video ref={ref} playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }} />
    </View>
  );
}
