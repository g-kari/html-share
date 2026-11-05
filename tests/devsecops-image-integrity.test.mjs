import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/devsecops-oss.html'), 'utf8');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePng(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let offset = 8;
  let dimensions;
  let channels;
  let ended = false;
  const idat = [];
  while (offset < bytes.length) {
    assert.ok(offset + 12 <= bytes.length, 'PNG chunk header/trailer is truncated');
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    assert.ok(end <= bytes.length, 'PNG chunk data is truncated');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + length)), bytes.readUInt32BE(end - 4), `${type} CRC mismatch`);
    if (type === 'IHDR') {
      assert.equal(offset, 8);
      assert.equal(length, 13);
      dimensions = [data.readUInt32BE(0), data.readUInt32BE(4)];
      assert.equal(data[8], 8, 'Expected 8-bit article PNG');
      channels = { 2: 3, 6: 4 }[data[9]];
      assert.ok(channels, 'Expected RGB/RGBA article PNG');
      assert.deepEqual([...data.subarray(10)], [0, 0, 0]);
    }
    if (type === 'IDAT') idat.push(data);
    offset = end;
    if (type === 'IEND') {
      assert.equal(length, 0);
      assert.equal(offset, bytes.length, 'Unexpected bytes after IEND');
      ended = true;
      break;
    }
  }
  assert.ok(ended && dimensions && idat.length, 'PNG requires IHDR, IDAT and IEND');
  const pixels = inflateSync(Buffer.concat(idat));
  const stride = dimensions[0] * channels + 1;
  assert.equal(pixels.length, stride * dimensions[1], 'Incomplete pixel stream');
  for (let row = 0; row < dimensions[1]; row++) assert.ok(pixels[row * stride] <= 4, 'Invalid row filter');
  return dimensions;
}

test('DevSecOps referenced PNGs are complete and match authored dimensions', () => {
  const ogp = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
  const twitter = /<meta name="twitter:image" content="([^"]+)"/.exec(html)?.[1];
  assert.equal(ogp, 'https://share.0g0.xyz/assets/devsecops-oss-ogp-v2.png');
  assert.equal(twitter, ogp);
  const width = Number(/<meta property="og:image:width" content="(\d+)"/.exec(html)?.[1]);
  const height = Number(/<meta property="og:image:height" content="(\d+)"/.exec(html)?.[1]);
  const ogpBytes = fs.readFileSync(path.join(root, 'public', new URL(ogp).pathname));
  assert.deepEqual(validatePng(ogpBytes), [width, height]);
  const image = /<img src="(assets\/devsecops-oss-explainer-v2\.png)" width="(\d+)" height="(\d+)"/.exec(html);
  assert.ok(image, 'Inline explanation must use the verified versioned image');
  const expansionLinks = [...html.matchAll(/<a href="(assets\/devsecops-oss-explainer-[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(expansionLinks, [image[1], image[1]], 'Both full-size links must match the displayed explanation');
  const explanationBytes = fs.readFileSync(path.join(root, 'public', image[1]));
  assert.deepEqual(validatePng(explanationBytes), [Number(image[2]), Number(image[3])]);
});

test('PNG integrity validation rejects partial transfers and altered payloads', () => {
  const bytes = fs.readFileSync(path.join(root, 'public/assets/devsecops-oss-explainer-v2.png'));
  assert.throws(() => validatePng(bytes.subarray(0, bytes.length - 20)), /truncated|IEND/);
  const damaged = Buffer.from(bytes);
  damaged[100] ^= 1;
  assert.throws(() => validatePng(damaged), /CRC mismatch/);
});
