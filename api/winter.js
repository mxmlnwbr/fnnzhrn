// Shared storage for the winter challenge (/winter).
// Data lives in Upstash Redis (Vercel → Storage → Upstash for Redis): one hash
// field per person and day, e.g. "Jo:2026-10-05" → {"steps":11200,"swim":true}.

const PEOPLE = ['Pascal', 'Jo', 'Luki'];
const KEY = 'winter:entries';

// Allowed fields per day: [min, max] for numbers, 'bool' for yes/no.
const FIELDS = {
  steps: [0, 100000],
  swim: 'bool',
  junkfree: 'bool',
  read: [0, 1440],
  screen: [0, 1440],
};

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: JSON.stringify(command),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error || `Redis-Fehler ${r.status}`);
  return data.result;
}

function cleanEntry(raw) {
  const entry = {};
  for (const [field, rule] of Object.entries(FIELDS)) {
    const v = raw && raw[field];
    if (v === undefined || v === null || v === '') continue;
    if (rule === 'bool') {
      if (v === true) entry[field] = true;
    } else {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < rule[0] || n > rule[1]) {
        throw new RangeError(`Ungültiger Wert für ${field}`);
      }
      entry[field] = n;
    }
  }
  return entry;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ error: 'Speicher nicht eingerichtet: Upstash Redis mit dem Vercel-Projekt verbinden.' });
  }
  const pin = process.env.WINTER_PIN;
  if (pin && req.headers['x-winter-pin'] !== pin) {
    return res.status(401).json({ error: 'PIN falsch oder fehlt.' });
  }

  try {
    if (req.method === 'GET') {
      const flat = (await redis(['HGETALL', KEY])) || [];
      const entries = {};
      for (let i = 0; i < flat.length; i += 2) entries[flat[i]] = JSON.parse(flat[i + 1]);
      return res.status(200).json({ people: PEOPLE, entries });
    }

    if (req.method === 'POST') {
      const { person, date, entry: raw } = req.body || {};
      if (!PEOPLE.includes(person)) return res.status(400).json({ error: 'Unbekannte Person.' });
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Ungültiges Datum.' });
      }
      let entry;
      try {
        entry = cleanEntry(raw);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
      const field = `${person}:${date}`;
      if (Object.keys(entry).length) await redis(['HSET', KEY, field, JSON.stringify(entry)]);
      else await redis(['HDEL', KEY, field]);
      return res.status(200).json({ entry });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Methode nicht erlaubt.' });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
