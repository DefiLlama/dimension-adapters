/** Scope regression for protocol-confirmed test activity. Runs without network. */
import assert from 'node:assert/strict';
import { Balances } from '@defillama/sdk';
import { Interface } from 'ethers';
const receipts = require('../helpers/getTxReceipts');
let tx: any;
receipts.getTransactionsWithRetry = async () => [tx];
const { fetchTristeroVolumeBuckets, ERC20_TRANSFER_TOPIC } = require('../helpers/tristero');
const sender='0xa02fb9638c16723310b6b57fed85cb2c03b86c19',filler='0xe3d2b0c14ab8ebf5d9cd0130a0bc1188f737412f';
const router='0x3341f2d46441118e3fb819e5b0166e25cfc4b3a1',usdc='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',zero='0x'+'0'.repeat(40);
const iface=new Interface(['function send((address sender,(address srcAsset,address dstAsset,uint256 srcQuantity,uint256 dstQuantity,uint256 minQuantity,uint128 darkSalt) parameters,uint256 deadline,address target,address filler,string orderType,bytes customData) order,(uint256 nonce,bytes signature) payload,(address multicallTarget,(address target,bool allowFailure,uint256 value,bytes callData)[] calls,address refundTo,address nftRecipient) arb,uint256 minOut,(address vault,((address token,uint256 amount) permitted,uint256 nonce,uint256 deadline) permit,bytes signature) v)']);
async function check(index: number, date: string, chain: string, from: string, maker: string, external: boolean, kind: string, excluded: boolean) {
 const hash='0x'+String(index).padStart(64,'0');
 tx={hash,to:router,from:maker,input:iface.encodeFunctionData('send',[[from,[usdc,usdc,2500000000,2500000000,2500000000,0],9999999999,from,maker,kind,'0x'],[0,'0x'],[zero,external?[[maker,false,0,'0x']]:[],from,from],0,[zero,[[zero,0],0,0],'0x']])};
 const result=await fetchTristeroVolumeBuckets({chain,dateString:date,fromTimestamp:Date.parse(date)/1000+index,toTimestamp:Date.parse(date)/1000+index+1,createBalances:()=>new Balances({chain}),getLogs:async(p:any)=>p.topics?[{transactionHash:hash,topics:[ERC20_TRANSFER_TOPIC,'0x'+from.slice(2).padStart(64,'0'),'0x'+router.slice(2).padStart(64,'0')]}]:[]});
 const sum=(balance:any)=>Object.values(balance.getBalances()).reduce((a:bigint,v:any)=>a+BigInt(v),0n);
 const isDarkpool=kind==='TAKER'&&!external;
 assert.equal(sum(result.darkpool),!excluded&&isDarkpool?2500000000n:0n,`${date} ${chain} darkpool ${from}/${maker}`);
 assert.equal(sum(result.aggregation),!excluded&&!isDarkpool?2500000000n:0n,`${date} ${chain} aggregation ${from}/${maker}`);
}
async function main(){
 await check(1,'2026-08-28','base',sender,filler,false,'TAKER',true);
 await check(2,'2026-08-27','base',sender,filler,false,'TAKER',false);
 await check(3,'2026-08-29','base',sender,filler,false,'TAKER',false);
 await check(4,'2026-08-28','unichain',sender,filler,false,'TAKER',false);
 await check(5,'2026-08-28','base',sender,'0x'+'33'.repeat(20),false,'TAKER',false);
 await check(6,'2026-08-28','base',sender,filler,true,'TAKER',false);
 await check(7,'2026-08-28','base',sender,filler,false,'CROSS',false);
 await check(8,'2026-08-28','base',filler,sender,false,'TAKER',false);
 await check(9,'2026-08-28','base','0x'+'44'.repeat(20),filler,false,'TAKER',false);
 console.log('PASS: 18 exclusion-scope assertions; adjacent dates, other chain/counterparty/direction and external routing remain counted.');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
