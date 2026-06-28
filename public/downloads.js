// ============================================================
// TANGSKYMUSIFY - DOWNLOADS MODULE
// Simpan audio ke IndexedDB, putar offline, kelola library unduhan
// ============================================================

const DB_NAME = 'tangskymusify-downloads';
const DB_VERSION = 1;
const STORE_NAME = 'songs';

let _db = null;

function openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                var store = db.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
                store.createIndex('title', 'title', { unique: false });
                store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
            }
        };
        req.onsuccess = function(e) { _db = e.target.result; resolve(_db); };
        req.onerror = function(e) { reject(e.target.error); };
    });
}

function dlGetAll() {
    return openDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction(STORE_NAME, 'readonly');
            var req = tx.objectStore(STORE_NAME).getAll();
            req.onsuccess = function() { resolve(req.result || []); };
            req.onerror = function(e) { reject(e.target.error); };
        });
    });
}

function dlGet(videoId) {
    return openDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction(STORE_NAME, 'readonly');
            var req = tx.objectStore(STORE_NAME).get(videoId);
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror = function(e) { reject(e.target.error); };
        });
    });
}

function dlSave(song) {
    return openDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            var req = tx.objectStore(STORE_NAME).put(song);
            req.onsuccess = function() { resolve(); };
            req.onerror = function(e) { reject(e.target.error); };
        });
    });
}

function dlDelete(videoId) {
    return openDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            var req = tx.objectStore(STORE_NAME).delete(videoId);
            req.onsuccess = function() { resolve(); };
            req.onerror = function(e) { reject(e.target.error); };
        });
    });
}

function dlExists(videoId) {
    return dlGet(videoId).then(function(s) { return !!s; });
}

// ---- Download lagu ke IndexedDB + trigger unduh file ----
function downloadSong(track, mode) {
    // mode: 'save' = simpan ke library offline, 'file' = unduh file MP3 ke perangkat
    if (!track) return;
    var videoId = track.videoId || track.id;
    var ytUrl = track.ytUrl || ('https://youtube.com/watch?v=' + videoId);

    // Update badge & status
    updateDownloadBadge(videoId, 'loading');
    showToast('⏳ Menyiapkan unduhan...');

    fetch('/api/ytplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ytUrl })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
        if (!d || !d.status || !d.result || !d.result.download || !d.result.download.audio) {
            showToast('⚠️ Gagal mendapatkan link audio');
            updateDownloadBadge(videoId, 'none');
            return;
        }
        var audioUrl = d.result.download.audio;
        var proxyUrl = '/api/proxy-audio?url=' + encodeURIComponent(audioUrl);

        if (mode === 'file') {
            // Unduh langsung ke perangkat
            var a = document.createElement('a');
            a.href = proxyUrl;
            a.download = (track.title || 'lagu').replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_') + '.mp3';
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('✅ Unduhan ke perangkat dimulai!');
            updateDownloadBadge(videoId, 'none');
            return;
        }

        // mode: 'save' — fetch audio jadi ArrayBuffer, simpan ke IndexedDB
        showToast('⏬ Mengunduh audio ke library... Mohon tunggu');

        // Coba proxy dulu, fallback ke direct URL
        function fetchAudioBuffer(url, fallbackUrl) {
            return fetch(url).then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.arrayBuffer();
            }).catch(function(err) {
                if (fallbackUrl && fallbackUrl !== url) {
                    return fetch(fallbackUrl).then(function(r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.arrayBuffer();
                    });
                }
                throw err;
            });
        }

        fetchAudioBuffer(proxyUrl, audioUrl)
        .then(function(buf) {
            if (!buf || buf.byteLength < 1000) {
                throw new Error('File audio terlalu kecil, mungkin gagal di-fetch');
            }
            var coverUrl = (track.cover && track.cover !== '' && !track.cover.startsWith('data:')) ? track.cover : null;

            function saveSong(coverData) {
                var song = {
                    videoId: videoId,
                    title: track.title || 'Lagu',
                    artist: track.artist || 'Unknown',
                    cover: coverData || track.cover || '',
                    audioBlob: buf,
                    downloadedAt: Date.now(),
                    duration: track.duration || 0
                };
                return dlSave(song).then(function() {
                    showToast('✅ ' + (track.title || 'Lagu') + ' tersimpan offline!');
                    updateDownloadBadge(videoId, 'saved');
                    if (typeof Downloads !== 'undefined') {
                        Downloads.refreshIfOpen();
                    }
                });
            }

            if (coverUrl) {
                fetch(coverUrl)
                .then(function(r) { return r.ok ? r.blob() : null; })
                .then(function(blob) {
                    if (blob) {
                        var reader = new FileReader();
                        reader.onload = function(e) { saveSong(e.target.result); };
                        reader.onerror = function() { saveSong(null); };
                        reader.readAsDataURL(blob);
                    } else { saveSong(null); }
                })
                .catch(function() { saveSong(null); });
            } else {
                saveSong(null);
            }
        })
        .catch(function(err) {
            showToast('⚠️ Gagal simpan offline: ' + err.message);
            updateDownloadBadge(videoId, 'none');
        });
    })
    .catch(function() {
        showToast('⚠️ Gagal menghubungi server');
        updateDownloadBadge(videoId, 'none');
    });
}

// ---- Update ikon download di UI ----
function updateDownloadBadge(videoId, state) {
    // state: 'none' | 'loading' | 'saved'
    var btns = document.querySelectorAll('[data-dl-video="' + videoId + '"]');
    btns.forEach(function(btn) {
        if (state === 'loading') {
            btn.innerHTML = '<svg class="w-4.5 h-4.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg>';
        } else if (state === 'saved') {
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" class="w-4.5 h-4.5 text-[#1ed760]"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        } else {
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4.5 h-4.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
        }
    });
}

// ---- Popup pilih mode download ----
function showDownloadOptions(track) {
    if (!track) return;
    var videoId = track.videoId || track.id;
    var existing = document.getElementById('dl-options-popup');
    if (existing) existing.remove();

    dlExists(videoId).then(function(saved) {
        var popup = document.createElement('div');
        popup.id = 'dl-options-popup';
        popup.className = 'fixed inset-0 z-[400] flex items-end justify-center bg-black/60';
        popup.onclick = function(e) { if (e.target === popup) popup.remove(); };

        var savedBadge = saved ? '<span class="ml-2 text-[10px] bg-[#1ed760]/20 text-[#1ed760] px-2 py-0.5 rounded-full font-semibold">✓ Tersimpan</span>' : '';

        popup.innerHTML =
            '<div class="bg-[#161616] w-full max-w-md rounded-t-3xl p-6 border-t border-white/10" style="animation:slideUp 0.3s ease-out forwards;">' +
                '<div class="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"></div>' +
                '<div class="flex items-center gap-3 mb-5">' +
                    '<img src="' + (track.cover || '') + '" class="w-14 h-14 rounded-xl object-cover" onerror="this.style.display=\'none\'" />' +
                    '<div class="truncate">' +
                        '<p class="font-bold text-white truncate">' + es(track.title || 'Lagu') + '</p>' +
                        '<p class="text-[#6b7280] text-sm truncate">' + es(track.artist || '') + '</p>' +
                    '</div>' +
                '</div>' +
                '<div class="space-y-3">' +
                    '<button onclick="document.getElementById(\'dl-options-popup\').remove();downloadSong(S.ct,\'save\')" class="w-full flex items-center gap-4 p-4 glass glass-hover rounded-2xl active:scale-95 transition-all">' +
                        '<div class="w-10 h-10 rounded-xl bg-[#1ed760]/20 flex items-center justify-center flex-shrink-0">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="#1ed760" stroke-width="2" class="w-5 h-5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M5 8h.01M5 11h.01"/></svg>' +
                        '</div>' +
                        '<div class="text-left">' +
                            '<p class="font-bold text-white text-sm">Simpan ke Library Offline' + savedBadge + '</p>' +
                            '<p class="text-[#6b7280] text-xs mt-0.5">Simpan di browser, putar tanpa internet</p>' +
                        '</div>' +
                    '</button>' +
                    '<button onclick="document.getElementById(\'dl-options-popup\').remove();downloadSong(S.ct,\'file\')" class="w-full flex items-center gap-4 p-4 glass glass-hover rounded-2xl active:scale-95 transition-all">' +
                        '<div class="w-10 h-10 rounded-xl bg-[#3b82f6]/20 flex items-center justify-center flex-shrink-0">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" class="w-5 h-5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>' +
                        '</div>' +
                        '<div class="text-left">' +
                            '<p class="font-bold text-white text-sm">Unduh File MP3</p>' +
                            '<p class="text-[#6b7280] text-xs mt-0.5">Download ke folder unduhan perangkat</p>' +
                        '</div>' +
                    '</button>' +
                    (saved ?
                    '<button onclick="document.getElementById(\'dl-options-popup\').remove();dlDelete(\'' + videoId + '\').then(function(){showToast(\'🗑️ Dihapus dari library offline\');if(typeof Downloads!==\'undefined\')Downloads.refreshIfOpen();})" class="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-red-500/10 active:scale-95 transition-all border border-red-500/20">' +
                        '<div class="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" class="w-5 h-5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
                        '</div>' +
                        '<div class="text-left">' +
                            '<p class="font-bold text-red-400 text-sm">Hapus dari Library Offline</p>' +
                            '<p class="text-[#6b7280] text-xs mt-0.5">Hapus audio yang tersimpan di browser</p>' +
                        '</div>' +
                    '</button>' : '') +
                '</div>' +
                '<button onclick="document.getElementById(\'dl-options-popup\').remove()" class="w-full mt-4 py-3 border border-white/10 text-white rounded-full text-sm">Batal</button>' +
            '</div>';
        document.body.appendChild(popup);
    });
}

// ---- Downloads Page (tab di Library) ----
const Downloads = {
    _open: false,

    refreshIfOpen: function() {
        if (this._open) this.render();
    },

    render: function() {
        this._open = true;
        var container = document.getElementById('view-downloads');
        if (!container) return;
        container.innerHTML = '<div class="flex items-center justify-center py-16"><div class="w-8 h-8 border-2 border-[#cfd3d8] border-t-transparent rounded-full animate-spin"></div></div>';

        dlGetAll().then(function(songs) {
            songs.sort(function(a, b) { return b.downloadedAt - a.downloadedAt; });

            var totalMB = 0;
            songs.forEach(function(s) {
                if (s.audioBlob) totalMB += (s.audioBlob.byteLength || 0);
            });
            totalMB = (totalMB / 1024 / 1024).toFixed(1);

            var html = '<div class="px-4 pb-32">';
            html += '<div class="flex items-center gap-3 mb-6 pt-2">' +
                '<button onclick="Library.render();App.switch(\'library\')" class="text-white p-2 active:scale-90 -ml-2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-6 h-6"><path d="M19 12H5M12 5l-7 7 7 7"/></svg></button>' +
                '<div>' +
                    '<h2 class="text-xl font-bold text-white">Library Offline</h2>' +
                    '<p class="text-[#6b7280] text-xs">' + songs.length + ' lagu · ' + totalMB + ' MB tersimpan</p>' +
                '</div>' +
            '</div>';

            if (songs.length === 0) {
                html += '<div class="flex flex-col items-center justify-center py-20 text-center">' +
                    '<div class="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" class="w-10 h-10"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>' +
                    '</div>' +
                    '<p class="text-white font-bold text-lg mb-2">Belum ada lagu offline</p>' +
                    '<p class="text-[#6b7280] text-sm max-w-xs">Tekan tombol unduh di player, lalu pilih "Simpan ke Library Offline" untuk mendengarkan tanpa internet.</p>' +
                '</div>';
            } else {
                if (songs.length > 0) {
                    html += '<button onclick="Downloads.playAll()" class="w-full btn-chrome font-bold py-3 rounded-xl active:scale-95 mb-5 flex items-center justify-center gap-2">' +
                        '<svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
                        'Putar Semua Offline' +
                    '</button>';
                }

                html += '<div class="space-y-1">';
                songs.forEach(function(s, idx) {
                    var sizeKB = s.audioBlob ? Math.round(s.audioBlob.byteLength / 1024) : 0;
                    var sizeStr = sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : sizeKB + ' KB';
                    var dateStr = s.downloadedAt ? new Date(s.downloadedAt).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' }) : '';
                    html += '<div class="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer active:scale-[0.98] transition-all" onclick="Downloads.play(' + idx + ')">' +
                        '<img src="' + (s.cover || '') + '" class="w-12 h-12 rounded-lg object-cover flex-shrink-0" onerror="this.src=\'data:image/svg+xml,\'+encodeURIComponent(\'<svg xmlns=\\\"http://www.w3.org/2000/svg\\\" width=\\\"48\\\" height=\\\"48\\\"><rect width=\\\"48\\\" height=\\\"48\\\" fill=\\\"#2a2a2a\\\"/><text x=\\\"24\\\" y=\\\"24\\\" text-anchor=\\\"middle\\\" dy=\\\".35em\\\" font-size=\\\"20\\\" fill=\\\"#6b7280\\\">🎵</text></svg>\')" />' +
                        '<div class="flex-1 truncate">' +
                            '<p class="font-medium text-sm text-white truncate">' + es(s.title) + '</p>' +
                            '<p class="text-[#6b7280] text-xs truncate">' + es(s.artist) + '</p>' +
                            '<p class="text-[#3d4047] text-[10px] mt-0.5">' + sizeStr + ' · ' + dateStr + '</p>' +
                        '</div>' +
                        '<div class="flex items-center gap-1 flex-shrink-0">' +
                            '<span class="text-[9px] bg-[#1ed760]/15 text-[#1ed760] px-1.5 py-0.5 rounded-full font-bold">OFFLINE</span>' +
                            '<button onclick="event.stopPropagation();Downloads.confirmDelete(\'' + s.videoId + '\')" class="p-2 text-[#6b7280] hover:text-red-400 active:scale-90 transition-all">' +
                                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
                            '</button>' +
                        '</div>' +
                    '</div>';
                });
                html += '</div>';
            }

            html += '</div>';
            container.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }).catch(function(err) {
            container.innerHTML = '<div class="flex items-center justify-center py-16 text-[#6b7280]"><p>Gagal memuat: ' + err.message + '</p></div>';
        });
    },

    _songs: [],

    playAll: function() {
        dlGetAll().then(function(songs) {
            if (!songs.length) return;
            songs.sort(function(a, b) { return b.downloadedAt - a.downloadedAt; });
            Downloads._songs = songs;
            Downloads._playOffline(0, songs);
        });
    },

    play: function(idx) {
        dlGetAll().then(function(songs) {
            songs.sort(function(a, b) { return b.downloadedAt - a.downloadedAt; });
            Downloads._songs = songs;
            Downloads._playOffline(idx, songs);
        });
    },

    _playOffline: function(idx, songs) {
        var s = songs[idx];
        if (!s || !s.audioBlob) { showToast('⚠️ Audio tidak ditemukan'); return; }

        var blob = new Blob([s.audioBlob], { type: 'audio/mpeg' });
        var url = URL.createObjectURL(blob);

        // Buat track object kompatibel
        var track = {
            videoId: s.videoId,
            id: s.videoId,
            title: s.title,
            artist: s.artist,
            cover: s.cover,
            ytUrl: 'offline',
            offlineBlobUrl: url
        };

        // Set state player
        S.pl = songs.map(function(song, i) {
            return {
                videoId: song.videoId,
                id: song.videoId,
                title: song.title,
                artist: song.artist,
                cover: song.cover,
                ytUrl: 'offline',
                _offlineIdx: i
            };
        });
        S.pi = idx;
        S.ps = 'offline';
        S.ct = S.pl[idx];

        // Play via audio element langsung
        var AU = document.getElementById('audio-player');
        if (!AU) { AU = document.createElement('audio'); AU.id='audio-player'; AU.preload='auto'; AU.style.display='none'; document.body.appendChild(AU); }

        // Cleanup blob url lama
        if (AU._offlineBlobUrl) { try { URL.revokeObjectURL(AU._offlineBlobUrl); } catch(e) {} }
        AU._offlineBlobUrl = url;

        AU.src = url;
        AU.load();
        AU.play().catch(function(e) { showToast('⚠️ Gagal memutar: ' + e.message); });

        S.server = '2'; // pakai audio element
        S.ip = true; S.il = false;

        if (typeof UU === 'function') UU();
        if (typeof MP !== 'undefined' && typeof MP.show === 'function') MP.show();
        if (typeof UB === 'function') UB();
        if (typeof SP === 'function') SP();
        if (typeof resetLyricsUI === 'function') resetLyricsUI(s.videoId);

        showToast('🎵 Memutar offline: ' + s.title);
    },

    confirmDelete: function(videoId) {
        var popup = document.createElement('div');
        popup.className = 'fixed inset-0 z-[400] flex items-end justify-center bg-black/60';
        popup.onclick = function(e) { if (e.target === popup) popup.remove(); };
        popup.innerHTML =
            '<div class="bg-[#161616] w-full max-w-md rounded-t-3xl p-6 border-t border-white/10" style="animation:slideUp 0.3s ease-out forwards;">' +
                '<div class="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4"></div>' +
                '<h3 class="font-bold text-white mb-2">Hapus dari Library Offline?</h3>' +
                '<p class="text-[#6b7280] text-sm mb-5">Audio yang tersimpan akan dihapus. Kamu masih bisa memutar lagu ini secara online.</p>' +
                '<div class="flex gap-3">' +
                    '<button onclick="dlDelete(\'' + videoId + '\').then(function(){showToast(\'🗑️ Dihapus dari library offline\');Downloads.render();}).catch(function(){showToast(\'⚠️ Gagal menghapus\');});this.closest(\'.fixed\').remove();" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-full active:scale-95">Hapus</button>' +
                    '<button onclick="this.closest(\'.fixed\').remove()" class="px-6 py-3 glass glass-hover text-white rounded-full">Batal</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(popup);
    }
};

// ---- Pasang ke window supaya bisa dipanggil dari HTML ----
window.dlExists = dlExists;
window.dlDelete = dlDelete;
window.dlGet = dlGet;
window.downloadSong = downloadSong;
window.showDownloadOptions = showDownloadOptions;
window.updateDownloadBadge = updateDownloadBadge;
window.Downloads = Downloads;
