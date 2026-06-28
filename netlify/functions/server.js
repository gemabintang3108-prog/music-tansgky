// NETLIFY FUNCTION - wraps the existing Express API (api/*.js) so all
// backend routes work on Netlify exactly like they did on Vercel/local.
// /api/proxy-audio is handled separately by a Netlify Edge Function
// (see netlify/edge-functions/proxy-audio.js) because it needs to stream
// large audio responses, which this Lambda-style function can't do well.
const express = require('express');
const serverless = require('serverless-http');

const searchHandler = require('../../api/search.js');
const lyricsHandler = require('../../api/lyrics.js');
const artistHandler = require('../../api/artist.js');
const suggestHandler = require('../../api/suggest.js');
const ytplayHandler = require('../../api/ytplay.js');
const streamHandler = require('../../api/stream.js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/search', searchHandler);
app.get('/api/lyrics', lyricsHandler);
app.get('/api/artist', artistHandler);
app.get('/api/suggest', suggestHandler);
app.post('/api/ytplay', ytplayHandler); // ytplay pakai POST di sisi client
app.get('/api/stream', streamHandler);

module.exports.handler = serverless(app);
