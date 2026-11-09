/** Offline regression: pnpm exec ts-node --transpile-only tests/tristero-unichain.test.ts */
import assert from 'node:assert/strict';
import { Balances } from '@defillama/sdk';
import { Interface } from 'ethers';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FetchOptions } from '../adapters/types';

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/tristero-unichain.json'), 'utf8'));
let txs: any[] = [];
let missingTransaction = false;
const receipts = require('../helpers/getTxReceipts');
receipts.getTransactionsWithRetry = async (_chain: string, hashes: string[]) => hashes.map(h => missingTransaction ? null : txs.find(t => t.hash === h)?.tx);
receipts.getTxReceiptsWithRetry = async (_chain: string, hashes: string[]) => hashes.map(h => txs.find(t => t.hash === h)?.receipt);
const helper = require('../helpers/tristero');
const aggregator = require('../aggregators/tristero').default;
const darkpool = require('../dexs/tristero').default;
const fees = require('../fees/tristero').default;
const router = '0x3341f2d46441118e3fb819e5b0166e25cfc4b3a1';
const weth = '0x4200000000000000000000000000000000000006';
const zero = '0x' + '0'.repeat(40);
const sender = '0x' + '11'.repeat(20), filler = '0x' + '22'.repeat(20);
const iface = new Interface(['function send((address sender,(address srcAsset,address dstAsset,uint256 srcQuantity,uint256 dstQuantity,uint256 minQuantity,uint128 darkSalt) parameters,uint256 deadline,address target,address filler,string orderType,bytes customData) order,(uint256 nonce,bytes signature) payload,(address multicallTarget,(address target,bool allowFailure,uint256 value,bytes callData)[] calls,address refundTo,address nftRecipient) arb,uint256 minOut,(address vault,((address token,uint256 amount) permitted,uint256 nonce,uint256 deadline) permit,bytes signature) v)']);
let counter = 0, assertions = 0;
function options(chain = 'unichain'): FetchOptions {
  const fromTimestamp = 1785542400 + (++counter * 86400);
  return {
    chain, fromTimestamp, toTimestamp: fromTimestamp + 86399, dateString: '2026-10-03',
    createBalances: () => new Balances({ chain }),
    getLogs: async (params: any) => {
      if (!params.topics) return [];
      return txs.flatMap(t => t.receipt.logs).filter((l: any) => params.topics.every((v: any, i: number) => v === null || v.toLowerCase() === l.topics[i]?.toLowerCase()));
    },
  } as unknown as FetchOptions;
}
function raw(balance: Balances) {
  return Object.fromEntries(Object.entries(balance.getBalances()).filter(([, v]) => BigInt(String(v)) !== 0n).map(([k,v]) => [k.toLowerCase().split(':').pop(), String(v)]));
}
function equal(a: unknown, b: unknown) { assert.deepEqual(a,b); assertions++; }
function synthetic(kind: string, sameParty = false, external = false, token = weth, to = router) {
  const hash = '0x' + (counter + 100).toString(16).padStart(64, '0');
  const input = iface.encodeFunctionData('send', [[sender,[token,weth,1234567890123456789n,1,1,0],9999999999,sender,sameParty ? sender : filler,kind,'0x'],[0,'0x'],[zero,external ? [[filler,false,0,'0x']] : [],sender,sender],0,[zero,[[zero,0],0,0],'0x']]);
  // Discovery Transfer into the router. This synthetic fixture tests accounting,
  // not whether a log-free native order is discoverable on a live provider.
  return { hash, tx: { hash, from: filler, to, input }, receipt: { status: '0x1', logs: [{ address: weth, transactionHash: hash, topics: [helper.ERC20_TRANSFER_TOPIC,'0x'+sender.slice(2).padStart(64,'0'),'0x'+router.slice(2).padStart(64,'0')], data:'0x01' }] } };
}
async function main() {
  for (const adapter of [aggregator,darkpool,fees]) equal(adapter.chains.includes('unichain'),true);
  equal(helper.getActiveTristeroV3Routers('unichain','2026-06-17').length,0);
  equal(helper.getActiveTristeroV3Routers('unichain','2026-10-03')[0].router.toLowerCase(),router);
  for (const [day, expected] of Object.entries(fixture.expected_aggregation)) {
    txs = fixture.transactions.filter((t: any) => t.day === day);
    const buckets = await helper.fetchTristeroVolumeBuckets(options());
    equal(raw(buckets.aggregation),expected); equal(raw(buckets.darkpool),{});
  }
  txs = [synthetic('CROSS',false,false,zero)];
  let buckets = await helper.fetchTristeroVolumeBuckets(options());
  equal(raw(buckets.aggregation),{ [weth]: '1234567890123456789' }); equal(raw(buckets.darkpool),{});
  txs = [synthetic('TAKER',true)];
  buckets = await helper.fetchTristeroVolumeBuckets(options()); equal(raw(buckets.darkpool),{}); equal(raw(buckets.aggregation),{});
  txs = [synthetic('TAKER',true,true)];
  buckets = await helper.fetchTristeroVolumeBuckets(options()); equal(raw(buckets.aggregation),{ [weth]: '1234567890123456789' });
  txs = [synthetic('TAKER')];
  txs[0].receipt.logs.push({...txs[0].receipt.logs[0]});
  buckets = await helper.fetchTristeroVolumeBuckets(options()); equal(raw(buckets.darkpool),{ [weth]: '1234567890123456789' }); equal(raw(buckets.aggregation),{});
  const feeResult = await fees.fetch(options());
  equal(raw(feeResult.dailyFees),{}); equal(raw(feeResult.dailyRevenue),{}); equal(raw(feeResult.dailySupplySideRevenue),{});
  txs = [synthetic('CROSS',false,false,weth,filler)];
  buckets = await helper.fetchTristeroVolumeBuckets(options()); equal(raw(buckets.aggregation),{});
  txs = [synthetic('CROSS')]; txs[0].tx.input='0x12345678';
  buckets = await helper.fetchTristeroVolumeBuckets(options()); equal(raw(buckets.aggregation),{});
  txs = [synthetic('CROSS')]; missingTransaction=true;
  await assert.rejects(helper.fetchTristeroVolumeBuckets(options()),/Unable to load Tristero fill transaction/);assertions++;missingTransaction=false;
  txs = [synthetic('CROSS',false,false,zero)];
  buckets = await helper.fetchTristeroVolumeBuckets(options('base')); equal(raw(buckets.aggregation),{[weth]:'1234567890123456789'});
  txs=[]; buckets=await helper.fetchTristeroVolumeBuckets(options());equal(raw(buckets.aggregation),{});equal(raw(buckets.darkpool),{});
  console.log(`PASS: ${assertions} assertions; 3 recorded UTC days plus source-only, deduplication, native mapping, self-fill, routing, empty-day and missing-input cases.`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
