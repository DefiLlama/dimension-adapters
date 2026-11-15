import { chains } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getTonBlock, pageToncenterTxs, toncenterPost } from '../../helpers/ton';

// Mainnet tournament: https://tonscan.org/address/EQD3UGFe4F4fadfJrQamevZuNT-lUgEfXpANNkZqx4eEX30i
const TOURNAMENT = 'EQD3UGFe4F4fadfJrQamevZuNT-lUgEfXpANNkZqx4eEX30i';
// Treasury receiving campaign payments, resolved from the tournament configuration.
const TREASURY = 'UQDpsOCco_iOJCEotwNEdke2R61v6yk9gx_zK2-7t_nnCKiZ';
// First mainnet tournament transaction: masterchain block 102325186, 2026-10-30 16:59:56 UTC.
// Source: https://tonscan.org/address/EQD3UGFe4F4fadfJrQamevZuNT-lUgEfXpANNkZqx4eEX30i#transactions
const DEPLOYED_AT = 1793379596;
const SALES = 'Egg Sales';
const SURPLUS = 'Game Surplus';
const PARTNER = 'Partner Campaigns';

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
  // Cool Eggs V5.10 get_runtime_state ABI: TournamentRuntimeState has 20 fixed
  // TVM stack values plus 3 slots for the optional Leader (23 total).
  // sales.revenue.prizeShare and protocolShare are values 16 and 17 (zero-based).
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
  // Cool Eggs V5.10 external-log schema: AllocationRecorded#1ff02422
  // queryId:uint64 allocation:^EggAllocation root:uint256 price:Coins poolShare:Coins protocolShare:Coins.
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
  dailyRevenue.addGasToken(protocol, `${SURPLUS} To Treasury`);
  dailySupplySideRevenue.addGasToken(pool, `${SURPLUS} To Prize Pool`);

  const txs = await pageToncenterTxs({ account: TOURNAMENT,
    startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp });
  for (const tx of txs) {
    if (tx.description?.aborted || !tx.description?.compute_ph?.success || !tx.description?.action?.success) continue;
    for (const message of tx.out_msgs ?? []) {
      // AllocationRecorded#1ff02422, using the schema documented in allocationAmounts.
      if (message.opcode !== '0x1ff02422' || message.destination !== null) continue;
      const { price, pool, protocol } = allocationAmounts(message.message_content.body);
      dailyFees.addGasToken(price, SALES);
      dailyRevenue.addGasToken(protocol, `${SALES} To Treasury`);
      dailySupplySideRevenue.addGasToken(pool, `${SALES} To Prize Pool`);
    }
  }
  const partnerTxs = await pageToncenterTxs({ account: TREASURY,
    startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp });
  const seen = new Set<string>();
  for (const tx of partnerTxs) {
    const message = tx.in_msg;
    if (tx.description?.aborted !== false || tx.description?.compute_ph?.success !== true ||
        tx.description?.action?.success === false || !message?.source || message.bounced ||
        !message.destination || !chains.ton.compareAddress(message.destination, TREASURY) ||
        chains.ton.compareAddress(message.source, TOURNAMENT) || chains.ton.compareAddress(message.source, TREASURY)) continue;
    const comment = message.message_content?.decoded?.comment;
    if (typeof comment !== 'string' || !/^Cool Eggs partner [0-9a-f]{32} [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(comment)) continue;
    if (!message.hash) throw new Error('Missing Partner payment message hash');
    if (seen.has(message.hash)) continue;
    seen.add(message.hash);
    const amount = BigInt(message.value);
    if (amount <= 0n) continue;
    dailyFees.addGasToken(amount, PARTNER);
    dailyRevenue.addGasToken(amount, `${PARTNER} To Treasury`);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const feeSources = {
  [SALES]: 'Egg purchase price from successful AllocationRecorded logs, before its prize-pool/treasury split; free allocations contribute zero.',
  [SURPLUS]: 'Increase in the tournament prizeShare plus protocolShare surplus counters, after execution costs and before their split.',
  [PARTNER]: 'Successful incoming campaign payments to the treasury with the Cool Eggs partner campaign/operation comment. Each message is counted once; tournament payouts and treasury self-transfers are excluded.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.TON],
  start: '2026-10-30',
  fetch,
  methodology: {
    Fees: 'Egg sales plus distributed game surplus before the 50/50 prize-pool/treasury split, plus direct Partner campaign payments. Excludes network costs, refunds, prize top-ups and secondary NFT sales.',
    Revenue: 'The actual treasury portion of game sales and surplus, plus 100% of Partner campaign payments.',
    ProtocolRevenue: 'The actual treasury portion of game sales and surplus, plus 100% of Partner campaign payments.',
    SupplySideRevenue: 'The portion of the same sales and surplus allocated to the player prize pool, counted when allocated rather than when the champion claims.',
  },
  breakdownMethodology: {
    Fees: feeSources,
    Revenue: { [`${SALES} To Treasury`]: 'Treasury share recorded in purchase logs.', [`${SURPLUS} To Treasury`]: 'Increase in the protocolShare counter.', [`${PARTNER} To Treasury`]: 'Full campaign payment retained by the treasury.' },
    ProtocolRevenue: { [`${SALES} To Treasury`]: 'Treasury share recorded in purchase logs.', [`${SURPLUS} To Treasury`]: 'Increase in the protocolShare counter.', [`${PARTNER} To Treasury`]: 'Full campaign payment retained by the treasury.' },
    SupplySideRevenue: { [`${SALES} To Prize Pool`]: 'Prize-pool share recorded in purchase logs.', [`${SURPLUS} To Prize Pool`]: 'Increase in the prizeShare counter.' },
  },
};

export default adapter;
