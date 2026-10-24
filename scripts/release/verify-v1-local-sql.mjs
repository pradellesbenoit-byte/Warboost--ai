import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {PGlite} from "@electric-sql/pglite";
import {prepareOfflineTransition} from "./v1-compatibility.mjs";

// In-memory PostgreSQL WASM, NOT native PG, Supabase, Auth or a real restore.
const ddl=execFileSync("git",["show","59945b3e8f50c9f2c8b3cb58bd16fe8f6f1daa54:schema.sql"],{encoding:"utf8"});
const profile=ddl.match(/create table if not exists public\.wb1_profiles\s*\([\s\S]*?\);/i)?.[0];
assert.ok(profile,"actual V1 profile DDL must exist");
const A="00000000-0000-4000-8000-000000000001";
const B="00000000-0000-4000-8000-000000000002";
const state=id=>({player_id:id,player:{name:"Synthetic"},squads:Array.from({length:4},(_,i)=>({
  id:i+1,heroes:Array.from({length:5},()=>({name:"",power:null}))
}))});

test("actual V1 profile DDL stores two synthetic owners and transaction rollback preserves both",async()=>{
  const db=new PGlite();
  try{
    await db.exec(profile);
    for(const id of [A,B])
      await db.query("insert into wb1_profiles(player_id,state) values ($1,$2)",[id,state(id)]);
    const before=(await db.query("select player_id,state,updated_at from wb1_profiles order by player_id")).rows;
    const proposal=prepareOfflineTransition({accountId:A,state:state(A)});
    await db.exec("begin");
    await db.query("update wb1_profiles set state=$2 where player_id=$1",[A,proposal.candidate]);
    await db.exec("rollback");
    const after=(await db.query("select player_id,state,updated_at from wb1_profiles order by player_id")).rows;
    assert.deepEqual(after,before);
  }finally{await db.close()}
});
test("synthetic logical profile copy restores into a separate empty in-memory engine",async()=>{
  const source=new PGlite(),target=new PGlite();
  try{
    await source.exec(profile);await target.exec(profile);
    for(const id of [A,B])
      await source.query("insert into wb1_profiles(player_id,state) values ($1,$2)",[id,state(id)]);
    const exported=(await source.query("select player_id,state,updated_at from wb1_profiles order by player_id")).rows;
    for(const row of exported)
      await target.query("insert into wb1_profiles(player_id,state,updated_at) values ($1,$2,$3)",
        [row.player_id,row.state,row.updated_at]);
    assert.deepEqual((await target.query("select player_id,state,updated_at from wb1_profiles order by player_id")).rows,exported);
    assert.equal(exported[0].state.squads.length,4);
  }finally{await source.close();await target.close()}
});
