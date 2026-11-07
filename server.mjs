// language: JavaScript, file: server.mjs, target: Node.js, Fastify
import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ytdl from 'ytdl-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false });

app.get('/', async (req, reply) => {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) return reply.status(404).send('index.html no encontrado');
  reply.type('text/html').send(fs.readFileSync(htmlPath, 'utf-8'));
});

// Endpoint de streaming directo usando ytdl-core
app.get('/api/stream', async (req, reply) => {
  const videoId = req.query.id;
  if (!videoId) return reply.status(400).send('ID no proporcionado');

  try {
    const videoURL = `https://www.youtube.com/watch?v=${videoId}`;
    if (!ytdl.validateID(videoId) && !ytdl.validateURL(videoURL)) {
      return reply.status(400).send('ID de video inválido');
    }

    const stream = ytdl(videoURL, {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25
    });

    reply.type('audio/mp4');
    return reply.send(stream);
  } catch (e) {
    console.error('Error en streaming:', e.message);
    return reply.status(500).send('Error al reproducir el audio');
  }
});

// Endpoint de búsqueda utilizando la API interna de YouTube a través de ytdl
app.get('/api/search', async (req, reply) => {
  const query = (req.query.q || '').trim();
  if (!query) return [];

  try {
    const searchResult = await ytdl.getInfo(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`).catch(() => null);
    
    // Método alternativo de búsqueda ligera si getInfo directo falla
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const html = await res.text();
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
    
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    
    let items = [];
    if (contents) {
      for (const section of contents) {
        const videoList = section.itemSectionRenderer?.contents;
        if (videoList) {
          for (const vid of videoList) {
            if (vid.videoRenderer) {
              const v = vid.videoRenderer;
              items.push({
                id: v.videoId,
                title: v.title?.runs?.[0]?.text || 'Sin título',
                artist: v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || 'Artista',
                album: 'YouTube',
                durationSec: parseDuration(v.lengthText?.simpleText),
                artworkUrl: v.thumbnail?.thumbnails?.[v.thumbnail.thumbnails.length - 1]?.url || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&h=300&fit=crop',
                streamUrl: `/api/stream?id=${v.videoId}`
              });
            }
          }
        }
      }
    }

    return items.slice(0, 15);
  } catch (e) {
    console.error('Error en búsqueda:', e.message);
    return [];
  }
});

function parseDuration(str) {
  if (!str) return 180;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 180;
}

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
