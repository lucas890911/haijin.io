// Counter-based deterministic 32-bit stream, independent of host/global random state.
export const seededRandom = (seed, cursor) => {
    let h = 2166136261;
    for (const char of `${seed}:${cursor}`)
        h = Math.imul(h ^ char.charCodeAt(0), 16777619);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
};
export function draw(s, bound, purpose, rng) {
    // Rejection sampling avoids modulo bias (particularly for six-sided dice).
    const limit = Math.floor(0x100000000 / bound) * bound;
    for (let attempts = 0; attempts < 1000; attempts++) {
        const cursor = s.rngCursor++;
        const raw = rng(s.seed, cursor);
        if (!Number.isInteger(raw) || raw < 0 || raw >= 0x100000000)
            throw new Error('Invalid random source');
        const result = raw < limit ? raw % bound : -1;
        s.rngLog.push({ cursor, purpose, bound, result });
        if (result >= 0)
            return result;
    }
    throw new Error('Random source repeatedly rejected');
}
export function shuffle(s, items, purpose, rng) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = draw(s, i + 1, purpose, rng);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
