import { FetchOptions } from '../../adapters/types';
import { queryDuneSql } from '../../helpers/dune';
import { CPMM_PROGRAM, cpmmEvents } from './cpmm-events';

const PLATFORM='3om3BermKeuUVXEbtktzkiuPh4mY5fn1c8cNh1TR3DUj';
export const CPMM_LABELS={pairz:'CPMM Trading Fees To Pairz',suppliers:'CPMM Trading Fees To Raydium And LPs'};
export interface MigratedPool { pool:string; baseMint:string; quoteMint:string; slot:number; program:string; }
const address=(v:unknown):string=>{if(typeof v!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v))throw new Error('Invalid CPMM address');return v;};
export const migrationQuery=(options:FetchOptions)=>`
 SELECT DISTINCT account_cpswap_pool AS pool, account_base_mint AS base_mint,
   account_quote_mint AS quote_mint, call_block_slot AS slot, account_cpswap_program AS program
 FROM raydium_solana.raydium_launchpad_call_migrate_to_cpswap
 WHERE account_platform_config='${PLATFORM}'
   AND call_block_time >= TIMESTAMP '2026-09-07 00:00:00 UTC'
   AND call_block_time < from_unixtime(${options.endTimestamp})
   AND EXISTS (SELECT 1 FROM solana.transactions tx WHERE tx.id=call_tx_id AND tx.success
     AND tx.block_time >= TIMESTAMP '2026-09-07 00:00:00 UTC'
     AND tx.block_time < from_unixtime(${options.endTimestamp}))
`;
export function validateMigrations(rows:unknown):MigratedPool[]{
 if(!Array.isArray(rows))throw new Error('Missing Pairz migration registry');
 const seen=new Set<string>();
 return rows.map(r=>{
  if(!r||typeof r!=='object')throw new Error('Invalid migration row');
  const p={pool:address(r.pool),baseMint:address(r.base_mint),quoteMint:address(r.quote_mint),slot:r.slot,program:address(r.program)};
  if(seen.has(p.pool)||p.baseMint===p.quoteMint||!Number.isSafeInteger(p.slot)||p.slot<=0||p.program!==CPMM_PROGRAM)throw new Error('Conflicting or unsupported migration');
  seen.add(p.pool);return p;
 });
}
export const transactionQuery=(pools:MigratedPool[])=>{
 if(!pools.length)throw new Error('Missing CPMM pool targets');
 const targets=pools.map(p=>`'${address(p.pool)}'`).join(',');
 // Raw transactions avoid the old decoded event table entirely. Each tx is
 // fetched once even when a router touches multiple Pairz pools.
 return `SELECT id, block_slot, success, log_messages FROM solana.transactions
 WHERE TIME_RANGE AND success
   AND contains(account_keys,'${CPMM_PROGRAM}')
   AND arrays_overlap(account_keys, ARRAY[${targets}])`;
};
export function aggregateCpmm(options:Pick<FetchOptions,'createBalances'>,pools:MigratedPool[],rows:unknown){
 if(!Array.isArray(rows))throw new Error('Missing CPMM transaction results');
 const registry=new Map(pools.map(p=>[p.pool,p])),seen=new Set<string>();
 const dailyFees=options.createBalances(),dailyRevenue=options.createBalances(),dailySupplySideRevenue=options.createBalances();
 for(const tx of rows){
  if(!tx||typeof tx.id!=='string'||tx.success!==true||!Number.isSafeInteger(tx.block_slot))throw new Error('Invalid successful CPMM transaction');
  if(seen.has(tx.id))throw new Error('Duplicate CPMM transaction');seen.add(tx.id);
  for(const event of cpmmEvents(tx.log_messages)){
   const p=registry.get(event.pool);if(!p)continue;
   if(tx.block_slot<p.slot)throw new Error('CPMM trade precedes migration');
   if(!((event.inputMint===p.baseMint&&event.outputMint===p.quoteMint)||(event.inputMint===p.quoteMint&&event.outputMint===p.baseMint)))throw new Error('CPMM mint identity mismatch');
   const creatorMint=event.creatorFeeOnInput?event.inputMint:event.outputMint;
   if(BigInt(event.creatorFee)>0n&&creatorMint!==p.quoteMint)throw new Error('Unexpected Pairz creator fee mint');
   if(event.inputTransferFee!=='0'||event.outputTransferFee!=='0')throw new Error('CPMM transfer taxes require separate holder-tax coverage');
   dailyFees.add(event.inputMint,event.tradeFee,CPMM_LABELS.suppliers);
   dailySupplySideRevenue.add(event.inputMint,event.tradeFee,CPMM_LABELS.suppliers);
   dailyFees.add(creatorMint,event.creatorFee,CPMM_LABELS.pairz);
   dailyRevenue.add(creatorMint,event.creatorFee,CPMM_LABELS.pairz);
  }
 }
 return {dailyFees,dailyRevenue,dailySupplySideRevenue};
}
export async function fetchCpmm(options:FetchOptions,expectedCount:number){
 const pools=validateMigrations(await queryDuneSql(options,migrationQuery(options)));
 if(pools.length!==expectedCount)throw new Error('Pairz migration coverage changed or is incomplete');
 const rows=pools.length?await queryDuneSql(options,transactionQuery(pools)):[];
 return aggregateCpmm(options,pools,rows);
}
