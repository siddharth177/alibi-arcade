import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleApi } from '../server/api.mjs';
function api() {
  const sql=new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../drizzle/0000_reflective_ben_grimm.sql',import.meta.url),'utf8'));
  const db={prepare(q){let a=[];return{bind(...v){a=v;return this;},async first(){return sql.prepare(q).get(...a)||null;},async run(){return{meta:{changes:Number(sql.prepare(q).run(...a).changes)}};}};},async batch(a){return Promise.all(a.map(x=>x.run()));}};
  const req=async(path,method='GET',body,session)=>{const headers={'Content-Type':'application/json'};if(session)headers.Authorization='Bearer '+session.token;const r=await handleApi(new Request('https://game.test/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),db);return{status:r.status,...await r.json()};};
  return{sql,req};
}
async function setup(game,count){const f=api(),h=await f.req('/party','POST',{game,name:'Host'});assert.equal(h.status,201);const path='/party/'+h.session.code;const others=await Promise.all(Array.from({length:count-1},(_,i)=>f.req(path+'/join','POST',{name:'Friend '+i})));const all=[h,...others];const send=async(s,input)=>{const r=await f.req(path+'/command','POST',input,s);assert.equal(r.status,200,JSON.stringify(r));return r.view;};return{...f,h,path,all,send};}

test('HTTPS Hot Seat completes with simultaneous private choices, refreshes and rematch',async()=>{
 const f=await setup('hotseat',3); await Promise.all(f.all.map(p=>f.send(p.session,{type:'ready'})));
 let v=await f.send(f.h.session,{type:'start'});
 while(v.phase!=='finished'){
   const seat=f.all.find(p=>p.view.me===v.seat), others=f.all.filter(p=>p!==seat);
   await f.send(seat.session,{type:'hotAnswer',choice:2});
   const before=await f.req(f.path,'GET',undefined,others[0].session); assert.equal(before.view.result,null); assert.equal(before.view.ownChoice,null);
   await Promise.all(others.map(p=>f.send(p.session,{type:'hotGuess',choice:2})));
   v=(await f.req(f.path,'GET',undefined,f.h.session)).view; assert.equal(v.phase,'result');
   v=await f.send(f.h.session,{type:'hotNext'});
 }
 assert.ok(v.players.every(p=>p.score===2)); const reset=await f.send(f.h.session,{type:'rematch'});assert.equal(reset.phase,'lobby');assert.equal(reset.players.length,3);f.sql.close();
});
test('HTTPS Codebreakers enforces team key privacy, auth, shared guesses, victory and rematch',async()=>{
 const f=await setup('codebreakers',4);
 for(let i=0;i<4;i++)await f.send(f.all[i].session,{type:'joinTeam',team:i<2?'red':'blue',role:i%2===0?'guesser':'spymaster'});
 await Promise.all(f.all.map(p=>f.send(p.session,{type:'ready'})));let v=await f.send(f.h.session,{type:'start'});
 assert.ok(v.board.every(c=>c.color===null));
 const active=v.players.filter(p=>p.team===v.turn), spy=f.all.find(p=>p.view.me===active.find(p=>p.role==='spymaster').id), guesser=f.all.find(p=>p.view.me===active.find(p=>p.role==='guesser').id);
 const key=(await f.req(f.path,'GET',undefined,spy.session)).view;assert.ok(key.board.every(c=>c.color));
 const forged=await f.req(f.path+'/command','POST',{type:'codeClue',word:'Connections',count:1,actor:spy.view.me},guesser.session);assert.equal(forged.status,400);
 await f.send(spy.session,{type:'codeClue',word:'Connections',count:key.remaining[key.turn]});
 for(const i of key.board.map((c,i)=>c.color===key.turn?i:-1).filter(i=>i>=0))v=await f.send(guesser.session,{type:'codeGuess',index:i});
 assert.equal(v.phase,'finished');assert.equal(v.winner,key.turn);assert.ok(v.board.every(c=>c.color));
 const reset=await f.send(f.h.session,{type:'rematch'});assert.deepEqual(reset.board,[]);assert.deepEqual(reset.clueHistory,[]);f.sql.close();
});
test('HTTPS game selection rejects unknown games and advertises all supported games',async()=>{
 const f=api();const bad=await f.req('/party','POST',{game:'not-a-game',name:'Host'});assert.equal(bad.status,400);
 const health=await f.req('/health');assert.deepEqual(health.games,['mafia','hotseat','codebreakers']);f.sql.close();
});
