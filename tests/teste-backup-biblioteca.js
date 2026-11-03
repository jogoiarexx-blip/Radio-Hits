'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const begin = app.indexOf('  function exportLibrary() {');
const end = app.indexOf('  async function backupLibrary()', begin);
assert.ok(begin > 0 && end > begin);
const state = {
  favorites: new Set(['rock-1', 'desaparecida']),
  playlists: {Favoritas: ['rock-1','desaparecida','rock-1']},
  selectedPlaylist:'Favoritas'
};
let persisted=0, renders=0;
const tracks = {
  'rock-1': {id:'rock-1',title:'Rock 1'},
  'vinheta': {id:'vinheta',isJingle:true}
};
const ctx = {
  state, JSON, Object, Set,
  trackById: id => tracks[id],
  persist: () => persisted++,
  renderFavorites: () => renders++,
  renderPlaylists: () => renders++,
  renderExplore: () => renders++,
  renderPlayer: () => renders++
};
vm.createContext(ctx);
vm.runInContext(app.slice(begin,end),ctx);
const backup=JSON.parse(ctx.exportLibrary());
assert.deepEqual(backup.favorites,['rock-1']);
assert.deepEqual(backup.playlists.Favoritas,['rock-1']);
ctx.restoreLibrary(JSON.stringify(backup));
assert.deepEqual([...state.favorites],['rock-1']);
assert.deepEqual(state.playlists.Favoritas,['rock-1']);
assert.equal(persisted,1);
assert.equal(renders,4);
assert.throws(()=>ctx.restoreLibrary('{}'),/Formato de backup inválido/);
const hostile='{"format":"radio-hits-library","version":1,"favorites":["vinheta","rock-1"],"playlists":{"__proto__":["rock-1"],"constructor":["rock-1"],"Seguras":["rock-1","vinheta","inexistente"]}}';
ctx.restoreLibrary(hostile);
assert.deepEqual([...state.favorites],['rock-1']);
assert.equal(Object.prototype.hasOwnProperty.call(state.playlists,'__proto__'),false);
assert.equal(Object.prototype.hasOwnProperty.call(state.playlists,'constructor'),false);
assert.deepEqual(state.playlists.Seguras,['rock-1']);
assert.equal(({}).polluted,undefined);
console.log('BACKUP OK: exportacao, restauracao, ids invalidos, vinhetas e nomes reservados.');
