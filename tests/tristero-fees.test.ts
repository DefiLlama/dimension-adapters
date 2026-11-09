/** Recorded economic regressions: loan funding is not a fee; destination charges are. */
import assert from 'node:assert/strict';
import { Balances } from '@defillama/sdk';
import { Interface, AbiCoder } from 'ethers';
import * as fs from 'node:fs';
import * as path from 'node:path';

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/tristero-fees.json'),'utf8'));
let current: any;
let missingReceipt = false;
const rpc = require('../helpers/getTxReceipts');
rpc.getTransactionsWithRetry = async (_chain: string, hashes: string[]) => hashes.map(() => current.tx);
rpc.getTxReceiptsWithRetry = async (_chain: string, hashes: string[]) => hashes.map(() => missingReceipt ? null : current.receipt);
const { getTristeroGasFeeTransfers, ERC20_TRANSFER_TOPIC } = require('../helpers/tristero');
const adapter = require('../fees/tristero').default;
const sendAbi='function send((address sender,(address srcAsset,address dstAsset,uint256 srcQuantity,uint256 dstQuantity,uint256 minQuantity,uint128 darkSalt) parameters,uint256 deadline,address target,address filler,string orderType,bytes customData) order,(uint256 nonce,bytes signature) payload,(address multicallTarget,(address target,bool allowFailure,uint256 value,bytes callData)[] calls,address refundTo,address nftRecipient) arb,uint256 minOut,(address vault,((address token,uint256 amount) permitted,uint256 nonce,uint256 deadline) permit,bytes signature) v)';
const takeAbi='function take((address sender,(address srcAsset,address dstAsset,uint256 srcQuantity,uint256 dstQuantity,uint256 minQuantity,uint128 darkSalt) parameters,uint256 deadline,address target,address filler,string orderType,bytes customData) order,(address multicallTarget,(address target,bool allowFailure,uint256 value,bytes callData)[] calls,address refundTo,address nftRecipient) arb,uint256 minOut,bool isFallback,bytes message,bytes attestation)';
const routerInterface = new Interface([sendAbi,takeAbi]);
const feeInterface = new Interface(['function cleanupErc20s(address[] tokens,address[] recipients,uint256[] amounts)','function cleanupNative(uint256 amount,address recipient)','event SolverCallExecuted(address to,bytes data,uint256 amount)','event SolverNativeTransfer(address to,uint256 amount)']);
const multicall='0x33333381c18a6c046b6510322195ca046ba7da2d';
const zero='0x'+'0'.repeat(40);
const topic=(address:string)=>'0x'+address.slice(2).padStart(64,'0');
let counter=0, assertions=0;
function equal(a:unknown,b:unknown) { assert.deepEqual(a,b); assertions++; }
function raw(balance:Balances) { return Object.fromEntries(Object.entries(balance.getBalances()).filter(([,v])=>BigInt(String(v))!==0n).map(([k,v])=>[k.split(':').pop(),String(v)])); }
function options() { const from=Date.parse(current.day+'T00:00:00Z')/1000+(++counter);return {chain:current.chain,dateString:current.day,fromTimestamp:from,toTimestamp:from+1,createBalances:()=>new Balances({chain:current.chain}),api:{call:()=>{throw new Error('Vault stock must not be queried for fees');}},getLogs:async()=>[{transactionHash:current.tx.hash}]}; }
function clone(i=0) { current=JSON.parse(JSON.stringify(fixture.transactions[i])); }
function encodeArgs(change:(args:any)=>void) { const decoded=routerInterface.parseTransaction({data:current.tx.input})!;const args=decoded.args.toArray(true);change(args);current.tx.input=routerInterface.encodeFunctionData(decoded.name,args); }
function transfer(token:string,from:string,to:string,amount:bigint,index:number) {return {address:token,topics:[ERC20_TRANSFER_TOPIC,topic(from),topic(to)],data:'0x'+amount.toString(16),logIndex:index};}
function event(name:string,values:any[],index:number) {return {address:multicall,...feeInterface.encodeEventLog(name,values),logIndex:index};}
function totals() {const result:Record<string,string>={};for(const f of getTristeroGasFeeTransfers(current.tx,current.receipt))result[f.token]=(BigInt(result[f.token]??0)+f.amount).toString();return result;}
async function main() {
  for(let i=0;i<fixture.transactions.length;i++) {
    clone(i);
    const result=await adapter.fetch(options());
    equal(raw(result.dailyFees),current.expected);
    equal(raw(result.dailyRevenue),current.expected);
    equal(raw(result.dailyProtocolRevenue),current.expected);
    equal(raw(result.dailySupplySideRevenue),{});
    equal(raw(result.dailyUserFees),current.expected);
    assert.notEqual(result.dailyFees,result.dailyRevenue);assertions++;
  }
  clone(); // The 8,100 USDC funding log must not appear in any fee/revenue metric.
  equal(totals()['0xaf88d065e77c8cc2239327c5edb3a432268e5831'],undefined);
  current.receipt.logs.push(transfer('0xaf88d065e77c8cc2239327c5edb3a432268e5831',current.tx.to,current.tx.from,123456n,9999));
  equal(totals(),current.expected); // unrelated router->filler payment
  current.receipt.logs.push({...current.receipt.logs.find((l:any)=>l.address==='0x912ce59144191c1204e64559fe8253a0e49e6548'&&l.topics[2]===topic(current.tx.from))});
  equal(totals(),current.expected); // duplicate log identity
  current.receipt.status='0x0';equal(totals(),{});
  clone(1);encodeArgs(args=>{args[3]=true;});equal(totals(),{}); // fallback proceeds
  clone(1);encodeArgs(args=>{args[0][0]=current.tx.from;});equal(totals(),{}); // self directed
  clone(1);encodeArgs(args=>{args[0][3]=current.tx.from;});equal(totals(),{}); // payout target is filler
  clone();missingReceipt=true;await assert.rejects(adapter.fetch(options()),/Missing Tristero gas abstraction receipt/);assertions++;missingReceipt=false;
  clone();current.tx.input='0xc93ce14100';assert.throws(()=>totals());assertions++;
  clone();delete current.receipt.status;assert.throws(()=>totals(),/Missing Tristero receipt status/);assertions++;

  // Fixed cleanup payment + successful event, with a failed optional remainder and
  // a successful zero-amount balance sweep. Only the fixed payment is a fee.
  clone();const token='0xaf88d065e77c8cc2239327c5edb3a432268e5831';const filler=current.tx.from;
  const fixed=feeInterface.encodeFunctionData('cleanupErc20s',[[token],[filler],[5]]);
  const failed=feeInterface.encodeFunctionData('cleanupErc20s',[[token],[filler],[7]]);
  const sweep=feeInterface.encodeFunctionData('cleanupErc20s',[[token],[filler],[0]]);
  encodeArgs(args=>{args[2][1]=[[multicall,false,0,fixed],[multicall,true,0,failed],[multicall,false,0,sweep]];});
  current.receipt.logs=[transfer(token,multicall,filler,5n,1),event('SolverCallExecuted',[multicall,fixed,0],2),transfer(token,multicall,filler,1000n,3),event('SolverCallExecuted',[multicall,sweep,0],4)];
  equal(totals(),{[token]:'5'});
  current.receipt.logs=current.receipt.logs.slice(1);assert.throws(()=>totals(),/Missing Tristero executed fee transfer/);assertions++;

  // Native service payments use the verified success and native-transfer events.
  clone();const native=feeInterface.encodeFunctionData('cleanupNative',[9,current.tx.from]);
  encodeArgs(args=>{args[2][1]=[[multicall,false,0,native]];});
  current.receipt.logs=[event('SolverNativeTransfer',[current.tx.from,9],1),event('SolverCallExecuted',[multicall,native,0],2)];
  equal(totals(),{[zero]:'9'});

  // A direct USDC RELAY skims only srcQuantity - minAmountUsdc.
  clone();encodeArgs(args=>{args[0][5]='RELAY';args[0][1][2]=10;args[0][6]=AbiCoder.defaultAbiCoder().encode(['uint32','uint256','uint256','uint32','uint32'],[1,7,1,1000,0]);args[2][1]=[];});
  current.receipt.logs=[transfer(token,current.tx.to,current.tx.from,3n,1),transfer(token,multicall,current.tx.from,99n,2)];
  equal(totals(),{[token]:'3'});
  encodeArgs(args=>{args[0][5]='TAKER';});equal(totals(),{});

  // An unverified beneficiary must not be published as zero-revenue/supply-side.
  clone();const known=current.tx.from,unknown='0x'+'77'.repeat(20);
  current=JSON.parse(JSON.stringify(current).replaceAll(known.slice(2),unknown.slice(2)));
  const result=await adapter.fetch(options());equal(raw(result.dailyFees),current.expected);
  equal(result.dailyRevenue,undefined);equal(result.dailyProtocolRevenue,undefined);equal(result.dailySupplySideRevenue,undefined);
  equal(adapter.pullHourly,true);
  console.log(`PASS: ${assertions} fee assertions; recorded margin, CCTP destination, optional remainder and positive Unichain charges; principal/refund/failure/unknown-beneficiary regressions.`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
