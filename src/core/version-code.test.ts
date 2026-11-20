import { describe, expect, it } from 'vitest';
import appConfig from '../../app.config.js';

const { versionCode } = appConfig as unknown as { versionCode: (version?: string) => number };

describe('versionCode', () => {
  it('turns X.Y.Z into a number that grows with every release', () => {
    expect(versionCode('1.0.0')).toBe(10000);
    expect(versionCode('1.0.1')).toBe(10001);
    expect(versionCode('1.2.3')).toBe(10203);
    expect(versionCode('1.10.0')).toBeGreaterThan(versionCode('1.9.99'));
    expect(versionCode('2.0.0')).toBeGreaterThan(versionCode('1.99.99'));
  });

  it('is above the versionCode 1 that 1.0.0 shipped with', () => {
    expect(versionCode('1.0.1')).toBeGreaterThan(1);
  });

  it('rejects versions it cannot order', () => {
    expect(() => versionCode('1.0')).toThrow();
    expect(() => versionCode('1.0.0-beta')).toThrow();
    expect(() => versionCode('1.100.0')).toThrow();
    expect(() => versionCode(undefined)).toThrow();
  });

  it('sets android.versionCode and keeps the rest of the config', () => {
    const out = appConfig({ config: { version: '1.0.1', android: { package: 'com.mrvoje.plumcast' } } } as never) as {
      android: { package: string; versionCode: number };
    };
    expect(out.android).toEqual({ package: 'com.mrvoje.plumcast', versionCode: 10001 });
  });
});
