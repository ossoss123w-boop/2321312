// language: JavaScript, file: server.mjs, target: Node.js, Fastify
import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false });

app.get('/', async (req, reply) => {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) return reply.status(404).send('index.html no encontrado');
  reply.type('text/html').send(fs.readFileSync(htmlPath, 'utf-8'));
});

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.tiekoetter.com'
];

async function fetchFromInvidious(endpoint) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1${endpoint}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const json = await res.json();
        return { data: json, instance };
      }
    } catch (e) {}
  }
  return { data: null, instance: null };
}

app.get('/api/search', async (req, reply) => {
  const query = (req.query.q || '').trim();
  if (!query) return [];

  const { data, instance } = await fetchFromInvidious(`/search?q=${encodeURIComponent(query)}&type=video`);
  if (!data) return reply.status(503).send({ error: 'Servicio no disponible' });

  return data.map(item => ({
    id: item.videoId,
    title: item.title,
    artist: item.author,
    album: 'Single',
    durationSec: item.lengthSeconds,
    artworkUrl: item.videoThumbnails?.find(t => t.quality === 'medium')?.url || item.videoThumbnails?.[0]?.url || '',
    streamUrl: `${instance}/latest_version?id=${item.videoId}&itag=140`
  }));
});

app.post('/api/upload', async (req, reply) => {
  try {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No se envió ningún archivo' });

    const buffer = await data.toBuffer();
    const formData = new FormData();
    formData.append('image', new Blob([buffer], { type: data.mimetype }), data.filename);

    const res = await fetch('https://img402.dev/api/free', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) throw new Error('Fallo en el servicio de imágenes');
    const json = await res.json();
    return { url: json.url };
  } catch (e) {
    console.error('Error subiendo imagen:', e.message);
    return reply.status(500).send({ error: 'Error interno subiendo la imagen' });
  }
});

const PORT = Number(process.env.PORT) || 3000;
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`\n🚀 Tonal Server listo en puerto ${PORT}\n`);
} catch (err) {
  console.error(err);
  process.exit(1);
}