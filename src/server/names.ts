function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const ADJ = [
  'amber', 'brisk', 'calm', 'clever', 'crisp', 'curious', 'daring', 'eager', 'electric', 'gentle', 'golden', 'grand', 'keen',
  'lucky', 'mellow', 'midnight', 'noble', 'quiet', 'rapid', 'silver', 'steady', 'stellar', 'swift', 'velvet', 'vivid', 'warm',
];
const NOUN = [
  'comet', 'falcon', 'forest', 'harbor', 'lighthouse', 'maple', 'meadow', 'mountain', 'nebula', 'ocean', 'orchard', 'otter',
  'owl', 'pioneer', 'river', 'sailor', 'sparrow', 'summit', 'tiger', 'violet', 'willow', 'wind',
];
const ENDING = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Stable, human-friendly pseudonym for a visitor id (e.g. "amber-falcon-three"). */
export function makeDisplayName(vid: string): string {
  const h = fnv1a32(vid);
  return `${ADJ[h % ADJ.length]}-${NOUN[(h >>> 8) % NOUN.length]}-${ENDING[(h >>> 16) % ENDING.length]}`;
}
