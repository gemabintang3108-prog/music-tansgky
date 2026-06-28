# TangskyMusify

Streaming musik YouTube dengan lirik, dibuat oleh Tangsky.

## Deploy ke Netlify

1. Push folder ini ke repo GitHub/GitLab/Bitbucket.
2. Di Netlify: **Add new site → Import an existing project**, pilih repo ini.
3. Build settings sudah diatur otomatis lewat `netlify.toml`:
   - Publish directory: `public`
   - Functions: `netlify/functions` (search, lyrics, artist, suggest, ytplay, stream)
   - Edge Function: `netlify/edge-functions/proxy-audio.js` (streaming audio, supaya bisa diputar/diunduh)
4. Klik **Deploy site**. Tidak perlu environment variable apa pun.
5. Selesai — semua endpoint `/api/*` otomatis jalan, dan PWA (manifest + service worker) langsung aktif di domain Netlify-nya.

## Development lokal

```bash
npm install
npm run dev
```
