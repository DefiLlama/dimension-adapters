import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeBase58 } from 'ethers';
import { CPMM_PROGRAM } from './cpmm-events';
import { aggregateCpmm, validateMigrations, transactionQuery } from './cpmm';
import { FetchOptions } from '../../adapters/types';
const addr=(n:number)=>encodeBase58(Buffer.alloc(32,n));
const pool={pool:addr(1),baseMint:addr(3),quoteMint:addr(2),slot:100,program:CPMM_PROGRAM};
class Balances { entries:{mint:string;amount:bigint;label:string}[]=[];add(mint:string,raw:string,label:string){this.entries.push({mint,amount:BigInt(raw),label});} }
const options={createBalances:()=>new Balances()} as unknown as FetchOptions;
function transaction(sell=false,tax=false){
 const b=Buffer.alloc(170);createHash('sha256').update('event:SwapEvent').digest().copy(b,0,0,8);
 b.fill(1,8,40);b.fill(sell?3:2,89,121);b.fill(sell?2:3,121,153);
 b.writeBigUInt64LE(5n,153);b.writeBigUInt64LE(20n,161);b[169]=sell?0:1;
 if(tax)b.writeBigUInt64LE(1n,72);
 return {id:sell?'sell':'buy',block_slot:101,success:true,log_messages:[`Program ${CPMM_PROGRAM} invoke [1]`,'Program log: Instruction: SwapBaseInput','Program data: '+b.toString('base64'),`Program ${CPMM_PROGRAM} success`]};
}
const run=(rows:any[],pools=[pool])=>aggregateCpmm(options,pools,rows) as unknown as Record<string,Balances>;
const result=run([transaction(),transaction(true)]);
assert.deepEqual(result.dailyRevenue.entries.map(x=>[x.mint,x.amount]),[[addr(2),20n],[addr(2),20n]]);
assert.deepEqual(result.dailySupplySideRevenue.entries.map(x=>[x.mint,x.amount]),[[addr(2),5n],[addr(3),5n]]);
const sum=(b:Balances,mint:string)=>b.entries.filter(x=>x.mint===mint).reduce((n,x)=>n+x.amount,0n);
for(const mint of [addr(2),addr(3)])assert.equal(sum(result.dailyFees,mint),sum(result.dailyRevenue,mint)+sum(result.dailySupplySideRevenue,mint));
assert.equal(run([transaction()],[]).dailyFees.entries.length,0);
for(const rows of [[transaction(),transaction()],[{...transaction(),success:false}],[{...transaction(),block_slot:99}],[transaction(false,true)],[{...transaction(),log_messages:null}]])assert.throws(()=>run(rows));
assert.throws(()=>run([transaction()],[{...pool,quoteMint:addr(4)}]));
const record={pool:pool.pool,base_mint:pool.baseMint,quote_mint:pool.quoteMint,slot:pool.slot,program:CPMM_PROGRAM};
assert.equal(validateMigrations([record]).length,1);
for(const rows of [[record,record],[{...record,program:addr(5)}],[{...record,slot:0}],[{...record,pool:"' OR TRUE"}]])assert.throws(()=>validateMigrations(rows));
assert.match(transactionQuery([pool]),/arrays_overlap\(account_keys/);
assert.ok(!transactionQuery([pool]).includes('evt_swapevent'));
console.log('PASS CPMM quote/base denomination, per-mint fee identity, foreign-pool exclusion, duplicate/failed/taxed/pre-migration rejection and registry validation.');
