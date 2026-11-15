import { chains } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getTonBlock, pageToncenterTxs, toncenterPost } from '../../helpers/ton';

// Mainnet tournament: https://tonscan.org/address/EQD3UGFe4F4fadfJrQamevZuNT-lUgEfXpANNkZqx4eEX30i
const TOURNAMENT = 'EQD3UGFe4F4fadfJrQamevZuNT-lUgEfXpANNkZqx4eEX30i';
const DEPLOYED_AT = 1793379596;
const SALES = 'Egg Sales';
const SURPLUS = 'Game Surplus';

async function surplusAt(timestamp: number) {
  if (timestamp < DEPLOYED_AT) return { pool: 0n, protocol: 0n };
  const seqno = await getTonBlock(timestamp);
  let response;
  // Toncenter intermittently routes archive reads to nodes whose state was pruned.
  // Same bounded retry as helpers/tonLst.ts; never substitute current state or zero.
  for (let attempt = 1; ; attempt++) {
    try {
      response = await toncenterPost({ path: 'runGetMethod', version: 2,
        body: { address: TOURNAMENT, method: 'get_runtime_state', stack: [], seqno } });
      break;
    } catch (error: any) {
      if (attempt >= 6 || !String(error?.message).includes('cannot load state')) throw error;
    }
  }
  const { result } = response;
  // Runtime stack fields 16 and 17 are cumulative surplus prizeShare and protocolShare.
  if (result.exit_code !== 0 || result.stack.length !== 23 ||
      result.stack[16][0] !== 'num' || result.stack[17][0] !== 'num')
    throw new Error('Unexpected Cool Eggs runtime state');
  return { pool: BigInt(result.stack[16][1]), protocol: BigInt(result.stack[17][1]) };
}

function allocationAmounts(body: string) {
  const boc = chains.ton.parseBoc(Buffer.from(body, 'base64'));
  if (boc.roots !== 1 || boc.root[0] !== 0 || (boc.cellData[0] & 8))
    throw new Error('Unexpected Cool Eggs allocation cell');
  const reader = new chains.ton.BitReader(boc.cellData.subarray(2, 2 + Math.ceil(boc.cellData[1] / 2)));
  if (reader.readUint(32) !== 0x1ff02422) throw new Error('Invalid allocation opcode');
  reader.skip(64 + 256); // queryId, root; allocation is stored in a reference.
  const coins = () => reader.readBigUint(reader.readUint(4) * 8);
  const price = coins(), pool = coins(), protocol = coins();
  if (price !== pool + protocol) throw new Error('Invalid allocation fee split');
  return { price, pool, protocol };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  // End is exclusive, matching the transaction helper's [start, end) window.
  const before = await surplusAt(options.startTimestamp - 1);
  const after = await surplusAt(options.endTimestamp - 1);
  const pool = after.pool - before.pool, protocol = after.protocol - before.protocol;
  if (pool < 0n || protocol < 0n) throw new Error('Cool Eggs surplus counters decreased');
  dailyFees.addGasToken(pool + protocol, SURPLUS);
  dailyRevenue.addGasToken(protocol, SURPLUS);
  dailySupplySideRevenue.addGasToken(pool, SURPLUS);

  const txs = await pageToncenterTxs({ account: TOURNAMENT,
    startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp });
  for (const tx of txs) {
    if (tx.description?.aborted || !tx.description?.compute_ph?.success || !tx.description?.action?.success) continue;
    for (const message of tx.out_msgs ?? []) {
      if (message.opcode !== '0x1ff02422' || message.destination !== null) continue;
      const { price, pool, protocol } = allocationAmounts(message.message_content.body);
      dailyFees.addGasToken(price, SALES);
      dailyRevenue.addGasToken(protocol, SALES);
      dailySupplySideRevenue.addGasToken(pool, SALES);
    }
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const feeSources = {
  [SALES]: 'Egg purchase price from successful AllocationRecorded logs, before its prize-pool/treasury split; free allocations contribute zero.',
  [SURPLUS]: 'Increase in the tournament prizeShare plus protocolShare surplus counters, after execution costs and before their split.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.TON],
  start: '2026-10-30',
  fetch,
  methodology: {
    Fees: 'Egg sales plus distributed game surplus before the 50/50 prize-pool/treasury split. Excludes network costs, refunds, prize top-ups, secondary NFT sales and off-contract partner campaigns.',
    Revenue: 'The actual treasury portion of the same sales and surplus.',
    ProtocolRevenue: 'The actual treasury portion of the same sales and surplus.',
    SupplySideRevenue: 'The portion of the same sales and surplus allocated to the player prize pool, counted when allocated rather than when the champion claims.',
  },
  breakdownMethodology: {
    Fees: feeSources,
    Revenue: { [SALES]: 'Treasury share recorded in purchase logs.', [SURPLUS]: 'Increase in the protocolShare counter.' },
    ProtocolRevenue: { [SALES]: 'Treasury share recorded in purchase logs.', [SURPLUS]: 'Increase in the protocolShare counter.' },
    SupplySideRevenue: { [SALES]: 'Prize-pool share recorded in purchase logs.', [SURPLUS]: 'Increase in the prizeShare counter.' },
  },
};

export default adapter;
