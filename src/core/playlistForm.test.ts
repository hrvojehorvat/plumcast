import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, applyServerInput, hostOf, isStale, validatePlaylistForm, type PlaylistFormValues } from './playlistForm';

const form = (patch: Partial<PlaylistFormValues>): PlaylistFormValues => ({ ...EMPTY_FORM, ...patch });

describe('applyServerInput', () => {
  it('splits a pasted provider link into server, username and password', () => {
    const next = applyServerInput(EMPTY_FORM, 'http://tv.example.com:8080/get.php?username=anna&password=s3cret&type=m3u_plus');
    expect(next).toMatchObject({ server: 'http://tv.example.com:8080', username: 'anna', password: 's3cret' });
  });

  it('keeps plain server input as typed', () => {
    expect(applyServerInput(EMPTY_FORM, 'tv.example.com').server).toBe('tv.example.com');
  });
});

describe('validatePlaylistForm', () => {
  it('requires server, username and password for a new Xtream playlist', () => {
    expect(validatePlaylistForm(form({ server: '' }))).toEqual({ ok: false, problem: 'server' });
    expect(validatePlaylistForm(form({ server: 'tv.example.com' }))).toEqual({ ok: false, problem: 'username' });
    expect(validatePlaylistForm(form({ server: 'tv.example.com', username: 'anna' }))).toEqual({ ok: false, problem: 'password' });
  });

  it('normalises the server and names the playlist after the host', () => {
    const result = validatePlaylistForm(form({ server: 'tv.example.com:8080/player_api.php', username: ' anna ', password: 'pw' }));
    expect(result).toEqual({
      ok: true,
      needsSync: true,
      draft: { name: 'tv.example.com', kind: 'xtream', server: 'http://tv.example.com:8080', username: 'anna', secret: { password: 'pw', guideOverride: '' } },
    });
  });

  it('on edit keeps the saved password when blank and only re-syncs if the login changed', () => {
    const edited = { kind: 'xtream' as const, server: 'http://tv.example.com', username: 'anna' };
    const renamed = validatePlaylistForm(form({ name: 'Home', server: 'http://tv.example.com', username: 'anna' }), edited);
    expect(renamed).toMatchObject({ ok: true, needsSync: false, draft: { name: 'Home', secret: {} } });
    const newUser = validatePlaylistForm(form({ server: 'http://tv.example.com', username: 'ben' }), edited);
    expect(newUser).toMatchObject({ ok: true, needsSync: true });
  });

  it('checks M3U links and keeps only the host in the stored fields', () => {
    expect(validatePlaylistForm(form({ kind: 'm3u-url', m3uUrl: 'not a url' }))).toEqual({ ok: false, problem: 'm3uUrl' });
    const ok = validatePlaylistForm(form({ kind: 'm3u-url', m3uUrl: 'https://user:pw@lists.example.org/get.php?x=1' }));
    expect(ok).toMatchObject({ ok: true, needsSync: true, draft: { server: 'lists.example.org', secret: { m3uUrl: 'https://user:pw@lists.example.org/get.php?x=1' } } });
  });

  it('requires a file for a new file playlist and names it after the file', () => {
    expect(validatePlaylistForm(form({ kind: 'm3u-file' }))).toEqual({ ok: false, problem: 'file' });
    const ok = validatePlaylistForm(form({ kind: 'm3u-file', file: { name: 'family.m3u8', text: '#EXTM3U' } }));
    expect(ok).toMatchObject({ ok: true, needsSync: true, draft: { name: 'family', kind: 'm3u-file' } });
    expect(validatePlaylistForm(form({ kind: 'm3u-file', name: 'X' }), { kind: 'm3u-file', server: null, username: null })).toMatchObject({ ok: true, needsSync: false });
  });

  it('checks the optional guide link and always passes it on (empty removes it)', () => {
    const base = { server: 'tv.example.com', username: 'anna', password: 'pw' };
    expect(validatePlaylistForm(form({ ...base, guideUrl: 'guide.xml' }))).toEqual({ ok: false, problem: 'guideUrl' });
    expect(validatePlaylistForm(form({ ...base, guideUrl: ' https://epg.example/g.xml ' }))).toMatchObject({ ok: true, draft: { secret: { guideOverride: 'https://epg.example/g.xml' } } });
    expect(validatePlaylistForm(form({ kind: 'm3u-file', file: { name: 'a.m3u', text: '' } }))).toMatchObject({ ok: true, draft: { secret: { guideOverride: '' } } });
  });

  it('asks for the new secret when the kind changes on edit', () => {
    const edited = { kind: 'm3u-url' as const, server: 'lists.example.org', username: null };
    expect(validatePlaylistForm(form({ server: 'tv.example.com', username: 'anna' }), edited)).toEqual({ ok: false, problem: 'password' });
  });
});

describe('helpers', () => {
  it('hostOf skips credentials and ports', () => {
    expect(hostOf('http://u:p@Host.Example.com:80/x')).toBe('host.example.com');
    expect(hostOf('nope')).toBeNull();
  });

  it('isStale: older than a day, never for file playlists', () => {
    const now = 10 * 86_400_000;
    expect(isStale({ kind: 'xtream', syncedAt: null }, now)).toBe(true);
    expect(isStale({ kind: 'xtream', syncedAt: now - 3_600_000 }, now)).toBe(false);
    expect(isStale({ kind: 'm3u-url', syncedAt: now - 2 * 86_400_000 }, now)).toBe(true);
    expect(isStale({ kind: 'm3u-file', syncedAt: null }, now)).toBe(false);
  });
});
