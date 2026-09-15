// Generates the placeholder character sprites in assets/characters/.
//
// These are NOT art. They exist so the nine characters are tellable apart on screen —
// without that, the Collection grid is nine identical images and the device walkthrough
// cannot check "the pulled character is in colour and the rest are silhouettes", or
// which character a duplicate belongs to.
//
// Each sprite is the character's initial on its rarity colour, so rarity is readable at
// a glance too. When real art arrives, drop the PNGs over these at the same paths and
// delete this script — nothing in src/ references it.
//
// Run: node scripts/generate-placeholder-sprites.mjs

import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'characters');
const SIZE = 256;

// Must match RARITY_COLOURS in src/data/characters.ts.
const RARITY_COLOURS = {
  3: [0xad, 0xb5, 0xbd],
  4: [0x97, 0x75, 0xfa],
  5: [0xf5, 0x9f, 0x00],
};

// Must match CHARACTERS in src/data/characters.ts.
const CHARACTERS = [
  { id: 'aria_01', letter: 'A', rarity: 5 },
  { id: 'brin_01', letter: 'B', rarity: 5 },
  { id: 'caul_01', letter: 'C', rarity: 4 },
  { id: 'dax_01', letter: 'D', rarity: 4 },
  { id: 'echo_01', letter: 'E', rarity: 4 },
  { id: 'fen_01', letter: 'F', rarity: 3 },
  { id: 'gale_01', letter: 'G', rarity: 3 },
  { id: 'hex_01', letter: 'H', rarity: 3 },
  { id: 'iris_01', letter: 'I', rarity: 3 },
];

// A 5x7 bitmap for each initial we need. Rows are top to bottom, '#' is ink.
const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
};

const GLYPH_W = 5;
const GLYPH_H = 7;
const SCALE = 24;
const INK = [0xff, 0xff, 0xff];

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData) >>> 0);
  return Buffer.concat([length, typeAndData, checksum]);
}

function encodePng(width, height, pixelAt) {
  // One filter byte (0 = none) then RGB per pixel, per scanline.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelAt(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// `alt` inverts the sprite — rarity-coloured glyph on near-black, inside a rarity
// border — so the R5 unlock is unmistakably a different image on screen. Still not
// art; see the header comment.
const ALT_BACKGROUND = [0x21, 0x25, 0x29];
const ALT_BORDER = 14;

function spriteFor({ letter, rarity }, alt = false) {
  const colour = RARITY_COLOURS[rarity];
  const glyph = GLYPHS[letter];
  const glyphPixelW = GLYPH_W * SCALE;
  const glyphPixelH = GLYPH_H * SCALE;
  const originX = Math.floor((SIZE - glyphPixelW) / 2);
  const originY = Math.floor((SIZE - glyphPixelH) / 2);

  return encodePng(SIZE, SIZE, (x, y) => {
    const gx = Math.floor((x - originX) / SCALE);
    const gy = Math.floor((y - originY) / SCALE);
    const inGlyph = gx >= 0 && gx < GLYPH_W && gy >= 0 && gy < GLYPH_H && glyph[gy][gx] === '#';

    if (!alt) {
      return inGlyph ? INK : colour;
    }

    const inBorder =
      x < ALT_BORDER || y < ALT_BORDER || x >= SIZE - ALT_BORDER || y >= SIZE - ALT_BORDER;
    if (inBorder) {
      return colour;
    }
    return inGlyph ? colour : ALT_BACKGROUND;
  });
}

mkdirSync(OUT_DIR, { recursive: true });
for (const character of CHARACTERS) {
  writeFileSync(join(OUT_DIR, `${character.id}.png`), spriteFor(character, false));
  writeFileSync(join(OUT_DIR, `${character.id}_alt.png`), spriteFor(character, true));
  console.log(`wrote ${character.id}.png + _alt.png  (${character.letter}, ${character.rarity}★)`);
}
console.log(`\n${CHARACTERS.length * 2} placeholder sprites written to assets/characters/`);
