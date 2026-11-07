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

// Proxy de flujo crudo: extrae el enlace directo de audio desde Piped/Invidious y lo sirve sin cortes
app.get('/api/stream', async (req, reply) => {
  const videoId = req.query.id;
  if (!videoId) return reply.status(400).send('ID no proporcionado');

  const instances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.in.projectsegfau.lt',
    'https://api.piped.privacy.com.de'
  ];

  for (const inst of instances) {
    try {
      const res = await fetch(`${inst}/streams/${videoId}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const json = await res.json();
        const audioStream = json.audioStreams?.find(s => s.mimeType?.includes('audio/mp4') || s.mimeType?.includes('audio/webm')) || json.audioStreams?.[0];
        
        if (audioStream && audioStream.url) {
          const streamRes = await fetch(audioStream.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(10000)
          });
          if (streamRes.ok) {
            reply.type(audioStream.mimeType || 'audio/mp4');
            return reply.send(streamRes.body);
          }
        }
      }
    } catch (e) {}
  }

  return reply.status(502).send('No se pudo resolver el stream de audio');
});

// Buscador global masivo mediante instancias Piped públicas
app.get('/api/search', async (req, reply) => {
  const query = (req.query.q || '').trim();
  if (!query) return [];

  const instances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.in.projectsegfau.lt',
    'https://api.piped.privacy.com.de'
  ];

  for (const inst of instances) {
    try {
      const res = await fetch(`${inst}/search?q=${encodeURIComponent(query)}&filter=music_songs`, {
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const json = await res.json();
        const items = json.items || json;
        if (Array.isArray(items) && items.length > 0) {
          return items.map(item => ({
            id: item.url?.split('=')[1] || item.id,
            title: item.title,
            artist: item.uploaderName || item.artist || 'Desconocido',
            album: 'Global Stream',
            durationSec: item.duration || 180,
            artworkUrl: item.thumbnail || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&h=300&fit=crop',
            streamUrl: `/api/stream?id=${item.url?.split('=')[1] || item.id}`
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
    return reply.status(500).send({ error: 'Error interno subiendo la imagen' });
  }
});

const PORT = Number(process.env.PORT) || 3000;
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`\n🚀 Tonal Server listo en puerto ${PORT}\n`);
} catch (err) {
  process.exit(1);
}
