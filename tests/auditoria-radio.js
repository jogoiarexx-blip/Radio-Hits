'use strict';
/* Auditoria executada no GitHub Actions antes de publicar o Radio Hits.
   Exercita as funções de relógio reais do player, sem precisar de DOM. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const offline = fs.readFileSync(path.join(root, 'js/offline.js'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalogo.json'), 'utf8'));
const tracks = catalog.tracks;
const order = catalog.radioOrder;
assert.ok(Array.isArray(tracks) && tracks.length > 0, 'Catálogo vazio');
assert.equal(tracks.length, order.length, 'Ordem da rádio deve conter todas as músicas');
assert.equal(new Set(order).size, tracks.length, 'Ordem deve ter IDs sem repetição');
assert.equal(new Set(tracks.map(t => t.id)).size, tracks.length, 'IDs únicos');
assert.ok(tracks.every(t => order.includes(t.id)), 'Faixa sem lugar na rádio');
assert.ok(tracks.every(t => t.duration > 0 && Number.isFinite(t.duration)), 'Duração inválida');
assert.ok(tracks.every(t => t.src.startsWith('./musicas/')), 'URL de áudio inválida');
assert.ok(tracks.every(t => t.cover.startsWith('./assets/')), 'Capa não validada');
assert.ok(tracks.every(t => typeof t.downloadAllowed === 'boolean'), 'Permissão offline não explícita');

const start = app.indexOf('  function radioTracks() {');
const stop = app.indexOf('  function queueFutureRadio(', start);
assert.ok(start !== -1 && stop > start, 'Funções da rádio não encontradas');
const clockFunctions = app.slice(start, stop);
const state = {radioOrder: order};
const EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);
const context = { state, EPOCH, playableTracks: () => tracks, Date };
vm.createContext(context);
vm.runInContext(clockFunctions, context);
const getRadioInfo = (now) => vm.runInContext('getRadioInfo(' + now + ')', context);
const total = tracks.reduce((sum, track) => sum + track.duration, 0);
assert.equal(context.radioTracks().length, tracks.length, 'Rádio omite faixas');
assert.equal(getRadioInfo(EPOCH).track.id, order[0], 'Primeira música inesperada');
const first = tracks.find(t=>t.id===order[0]);
assert.equal(getRadioInfo(EPOCH + Math.ceil((first.duration + 0.03)*1000)).track.id, order[1], 'Transição fora da ordem');
assert.equal(getRadioInfo(EPOCH + Math.round((total + 1)*1000)).track.id, order[0], 'Ciclo não reiniciou');
const a=getRadioInfo(EPOCH + 12_345_000);
const b=getRadioInfo(EPOCH + 12_345_000);
assert.equal(a.track.id,b.track.id, 'Ouvintes no mesmo horário não sincronizam');
assert.equal(a.offset,b.offset, 'Desvio de relógio na mesma entrada');

assert.match(app, /activeOfflineId\s*!==\s*t\.id/, 'Retomada offline não preservada');
assert.match(app, /t\.downloadAllowed\]/, 'Mudanças de permissão offline não detectadas');
assert.match(app, /t\.cover/, 'Mudanças de capa devem atualizar');
assert.match(app, /function libraryDuration/, 'Tempo de biblioteca ausente');
assert.match(html, /id="sidebar-library-runtime"/, 'Indicador de duração ausente');
assert.match(sw, /style\.css\?v=assets-2/, 'CSS versionado não está no cache offline');
assert.match(offline, /downloadAllowed !== true/, 'Validação de download ausente');

console.log('AUDITORIA OK: ' + tracks.length + ' músicas, ' + total.toFixed(3) + ' s, 0 IDs repetidos.');
console.log('Ordem sincronizada, volta ao início, offline, capas e cache: verificações aprovadas.');
