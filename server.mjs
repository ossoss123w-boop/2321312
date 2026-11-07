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

// Buscador multi-fuente: Jamendo (catálogo global libre y masivo) + Invidious secundario
app.get('/api/search', async (req, reply) => {
  const query = (req.query.q || '').trim();
  if (!query) return [];

  // 1. Intentar buscar en Jamendo API (millones de canciones con audio directo)
  try {
    const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=5993df08&format=json&limit=25&search=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.results && json.results.length > 0) {
        return json.results.map(track => ({
          id: track.id,
          title: track.name,
          artist: track.artist_name,
          album: track.album_name || 'Single',
          durationSec: track.duration,
          artworkUrl: track.album_image || track.image || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&h=300&fit=crop',
          streamUrl: track.audio
        }));
      }
    }
  } catch (e) {
    console.error('Jamendo fallback:', e.message);
  }

  // 2. Si falla Jamendo, recurrir a instancias estables de Invidious con reintentos
  const instances = ['https://vid.priv.au', 'https://invidious.nerdvpn.de', 'https://inv.nadeko.net'];
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
            album: 'YouTube Stream',
            durationSec: item.lengthSeconds,
            artworkUrl: item.videoThumbnails?.[0]?.url || '',
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
