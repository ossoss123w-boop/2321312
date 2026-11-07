// language: JavaScript, file: server.mjs, target: Node.js, Fastify
import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false });

// Lista de proxies activos extraídos de tu captura (IP y Puerto)
const PROXIES = [
  { host: '139.60.209.2', port: 80, type: 'http' },
  { host: '32.223.6.94', port: 80, type: 'http' },
  { host: '15.204.243.210', port: 80, type: 'http' },
  { host: '159.65.230.46', port: 8088, type: 'http' },
  { host: '142.93.202.130', port: 3128, type: 'http' },
  { host: '174.138.119.88', port: 80, type: 'http' },
  { host: '50.122.86.118', port: 80, type: 'http' },
  { host: '137.66.1.45', port: 80, type: 'http' },
  { host: '143.246.138.227', port: 80, type: 'http' },
  { host: '47.85.161.37', port: 3128, type: 'http' },
  { host: '31.56.65.108', port: 80, type: 'http' }
];

function getRandomProxy() {
  const p = PROXIES[Math.floor(Math.random() * PROXIES.length)];
  return `${p.type}://${p.host}:${p.port}`;
}

app.get('/', async (req, reply) => {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) return reply.status(404).send('index.html no encontrado');
  reply.type('text/html').send(fs.readFileSync(htmlPath, 'utf-8'));
});

// Importador de Spotify directo
app.get('/api/spotify-import', async (req, reply) => {
  const playlistUrl = req.query.url;
  if (!playlistUrl) return reply.status(400).send({ error: 'URL no proporcionada' });

  try {
    const res = await fetch(playlistUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return reply.status(400).send({ error: 'No se pudo leer la playlist' });

    const html = await res.text();
    const matches = [...html.matchAll(/"name":"([^"]+)","artists":\[{"name":"([^"]+)"/g)];
    const tracks = [];
    for (const match of matches) {
      tracks.push({ title: match[1], artist: match[2], query: `${match[2]} - ${match[1]}` });
    }
    return { success: true, count: tracks.length, tracks };
  } catch (e) {
    return reply.status(500).send({ error: 'Error procesando Spotify' });
  }
});

// Búsqueda conectada a Invidious con respaldo de nodos globales
app.get('/api/search', async (req, reply) => {
  const query = (req.query.q || '').trim();
  if (!query) return [];

  const instances = [
    'https://vid.priv.au',
    'https://invidious.nerdvpn.de',
    'https://inv.nadeko.net',
    'https://invidious.tiekoetter.com'
  ];

  for (const inst of instances) {
    try {
      const res = await fetch(`${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
          return json.map(item => ({
            id: item.videoId,
            title: item.title,
            artist: item.author,
            album: 'Single',
            durationSec: item.lengthSeconds || 180,
            artworkUrl: item.videoThumbnails?.find(t => t.quality === 'medium')?.url || item.videoThumbnails?.[0]?.url || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&h=300&fit=crop',
            streamUrl: `${inst}/latest_version?id=${item.videoId}&itag=140`
          }));
        }
      }
    } catch (e) {}
  }

  return [];
});

app.post('/api/upload', async (req, reply) => {
  try {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No se envió archivo' });
    const buffer = await data.toBuffer();
    const formData = new FormData();
    formData.append('image', new Blob([buffer], { type: data.mimetype }), data.filename);
    const res = await fetch('https://img402.dev/api/free', { method: 'POST', body: formData, signal: AbortSignal.timeout(15000) });
    const json = await res.json();
    return { url: json.url };
  } catch (e) {
    return reply.status(500).send({ error: 'Error interno' });
  }
});

const PORT = Number(process.env.PORT) || 3000;
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`\n🚀 Tonal Server listo en puerto ${PORT}\n`);
} catch (err) {
  process.exit(1);
}
