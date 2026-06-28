// NETLIFY EDGE FUNCTION - /api/proxy-audio
// Proxies the direct YouTube audio URL so the browser <audio> element can
// play/seek/download it without CORS issues. Runs on Netlify's Edge runtime
// (not a regular serverless Function) because it needs to stream large
// audio files with Range support, without the 10s/20MB limits that apply
// to regular synchronous Functions.
export default async (request) => {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (!targetUrl) {
        return new Response('Missing url parameter', { status: 400, headers: corsHeaders });
    }

    try {
        const range = request.headers.get('range');
        const upstream = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36',
                ...(range ? { 'Range': range } : {})
            }
        });

        const headers = new Headers(corsHeaders);
        ['content-type', 'content-length', 'accept-ranges', 'content-range'].forEach((h) => {
            const v = upstream.headers.get(h);
            if (v) headers.set(h, v);
        });

        return new Response(upstream.body, { status: upstream.status, headers });
    } catch (err) {
        return new Response('Proxy error: ' + (err && err.message ? err.message : 'unknown'), { status: 500, headers: corsHeaders });
    }
};

export const config = { path: '/api/proxy-audio' };
