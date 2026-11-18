import { describe, expect, it } from 'vitest';
import { XmltvParser, createUtf8Decoder, decodeXml, parseXmltv, parseXmltvDate, type XmltvProgramme } from './xmltv';

const DOC = `<?xml version="1.0" encoding="utf-8"?>
<tv generator-info-name="x">
  <channel id="one.de"><display-name>One</display-name></channel>
  <programme start="20261118200000 +0100" stop="20261118211500 +0100" channel="one.de">
    <title lang="de">Tatort &amp; Co</title>
    <title lang="en">Crime scene</title>
    <desc lang="de">Ein &quot;Fall&quot; &#252;ber &#x263A;</desc>
  </programme>
  <programme start="20261118211500 +0100" stop="20261118220000 +0100" channel='one.de'><title><![CDATA[News <live>]]></title></programme>
  <programme start="20261118220000 +0100" stop="20261118230000 +0100" channel="one.de" />
  <programme start="20261118230000" stop="20261118220000" channel="one.de"><title>Ends before start</title></programme>
  <programme start="20261118230000" stop="20261119000000" channel="one.de"><title></title></programme>
</tv>`;

describe('parseXmltvDate', () => {
  it('applies the offset', () => {
    expect(parseXmltvDate('20261118200000 +0100')).toBe(Date.UTC(2026, 10, 18, 19, 0, 0));
    expect(parseXmltvDate('20261118200000 -0230')).toBe(Date.UTC(2026, 10, 18, 22, 30, 0));
    expect(parseXmltvDate('202611182000 +01:00')).toBe(Date.UTC(2026, 10, 18, 19, 0, 0));
  });
  it('treats a missing offset as UTC', () => {
    expect(parseXmltvDate('20261118200000')).toBe(Date.UTC(2026, 10, 18, 20, 0, 0));
  });
  it('rejects junk', () => {
    expect(parseXmltvDate('tomorrow')).toBeNull();
    expect(parseXmltvDate(null)).toBeNull();
  });
});

describe('decodeXml', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeXml('a &amp; b &lt;c&gt; &#65;&#x42; &unknown;')).toBe('a & b <c> AB &unknown;');
  });
});

describe('parseXmltv', () => {
  it('reads programmes and skips broken ones', () => {
    const list = parseXmltv(DOC);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      channel: 'one.de',
      start: Date.UTC(2026, 10, 18, 19, 0),
      end: Date.UTC(2026, 10, 18, 20, 15),
      title: 'Tatort & Co',
      description: 'Ein "Fall" über ☺',
    });
    expect(list[1]).toMatchObject({ title: 'News <live>', description: null });
  });

  it('gives the same result for any chunking', () => {
    const whole = parseXmltv(DOC);
    for (const size of [1, 3, 7, 10, 11, 64]) {
      const out: XmltvProgramme[] = [];
      const parser = new XmltvParser((p) => out.push(p));
      for (let i = 0; i < DOC.length; i += size) parser.push(DOC.slice(i, i + size));
      parser.end();
      expect(out).toEqual(whole);
    }
  });
});

describe('createUtf8Decoder', () => {
  it('joins characters split across chunks', () => {
    const bytes = new Uint8Array([0x48, 0xc3, 0xbc, 0xe2, 0x98, 0xba, 0xf0, 0x9f, 0x8e, 0xac]); // "Hü☺🎬"
    for (let split = 1; split < bytes.length; split++) {
      const decode = createUtf8Decoder();
      expect(decode(bytes.slice(0, split)) + decode(bytes.slice(split), true)).toBe('Hü☺🎬');
    }
  });
});
