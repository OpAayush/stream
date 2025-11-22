// --- Pre-computed SHA-256 Constants ---
// First 32 bits of the fractional parts of the square roots of the first 8 primes
const HASH_CONSTANTS = [
  1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924,
  528734635, 1541459225,
];

// First 32 bits of the fractional parts of the cube roots of the first 64 primes
const ROUND_CONSTANTS = [
  1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993,
  2453635748, 2870763221, 3624381080, 310598401, 607225224, 1426881987,
  1925078388, 2162078206, 2614888103, 3248222580, 3835390401, 4022224774,
  264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986,
  2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711,
  113926993, 338241895, 666307205, 773529912, 1294757372, 1396182291,
  1695183700, 1986661051, 2177026350, 2456956037, 2730485921, 2820302411,
  3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344,
  430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063,
  1747873779, 1955562222, 2024104815, 2227730452, 2361852424, 2428436474,
  2756734187, 3204031479, 3329325298,
];

/**
 * Performs a right bitwise rotation.
 * @param {number} value - The 32-bit integer.
 * @param {number} amount - The number of bits to rotate by.
 * @returns {number} The rotated 32-bit integer.
 */
function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Calculates the SHA-256 hash of an ASCII string.
 * @param {string} ascii - The input string (must be ASCII).
 * @returns {string} The 64-character hex hash.
 */
export default function sha256(ascii) {
  const maxWord = Math.pow(2, 32);
  let result = "";

  // --- Preprocessing ---
  let words = [];
  const asciiBitLength = ascii.length * 8;

  // Initialize hash registers with a *copy* of the constants
  let hash = [...HASH_CONSTANTS];

  // Append '1' bit (plus zero padding)
  ascii += "\x80";
  // More zero padding
  while ((ascii.length % 64) - 56) ascii += "\x00";

  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    // **FIX**: Throw an error on non-ASCII input
    if (j >> 8) {
      throw new Error("Input contains non-ASCII characters.");
    }
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }

  // Append original message length (big-endian)
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  // --- Process each 512-bit chunk ---
  for (let j = 0; j < words.length; ) {
    // The message schedule (64 words)
    const w = words.slice(j, (j += 16));

    // Copy of current hash state
    const oldHash = [...hash];

    // Initialize working variables with current hash state
    let a = hash[0],
      b = hash[1],
      c = hash[2],
      d = hash[3],
      e = hash[4],
      f = hash[5],
      g = hash[6],
      h = hash[7];

    for (let i = 0; i < 64; i++) {
      // Expand the message schedule
      if (i >= 16) {
        const w15 = w[i - 15];
        const w2 = w[i - 2];
        const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
        const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      // Compression function core
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + ROUND_CONSTANTS[i] + w[i]) | 0;

      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      // Update working variables
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    // Add this chunk's hash to the result (32-bit addition)
    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  // --- Format Output ---
  // Convert 32-bit integers to big-endian hex
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += b.toString(16).padStart(2, "0");
    }
  }
  return result;
}
