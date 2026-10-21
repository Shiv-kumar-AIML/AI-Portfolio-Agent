import { describe, expect, it } from 'vitest';
import { encodeFrame, parseClientMessage } from '../src/protocol';

describe('client messages', () => {
  it('parses valid messages and fills defaults', () => {
    expect(parseClientMessage('{"t":"open","tab":"t1","url":"https://github.com"}')).toEqual({
      t: 'open',
      tab: 't1',
      url: 'https://github.com',
    });
    expect(parseClientMessage('{"t":"mouse","kind":"down","x":0.5,"y":0.25}')).toMatchObject({ button: 'left', clicks: 1 });
  });

  it('rejects malformed JSON, unknown types and out-of-range values', () => {
    expect(parseClientMessage('{')).toBeNull();
    expect(parseClientMessage('{"t":"eval","code":"x"}')).toBeNull();
    expect(parseClientMessage('{"t":"mouse","kind":"down","x":2,"y":0}')).toBeNull();
    expect(parseClientMessage('{"t":"open","tab":"../x","url":"https://github.com"}')).toBeNull();
    expect(parseClientMessage('{"t":"resize","w":99999,"h":10}')).toBeNull();
  });
});

describe('frames', () => {
  it('prefixes the JPEG with its tab id', () => {
    const frame = encodeFrame('t7', Buffer.from([0xff, 0xd8]));
    expect([...frame]).toEqual([2, 0x74, 0x37, 0xff, 0xd8]);
  });
});
