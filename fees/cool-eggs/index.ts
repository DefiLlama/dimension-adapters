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
  if (timestamp < DEPLOYED_AT) return 0n;
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
  // Only protocolShare is read: the prizeShare half is players' money pooled for the
  // champion, not a fee.
  if (result.exit_code !== 0 || result.stack.length !== 23 ||
      result.stack[16][0] !== 'num' || result.stack[17][0] !== 'num')
    throw new Error('Unexpected Cool Eggs runtime state');
  return BigInt(result.stack[17][1]);
}

// Treasury share of one Egg purchase; the equal poolShare funds the prize pool and is not a fee.
function allocationTreasuryShare(body: string) {
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
  return protocol;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  // End is exclusive, matching the transaction helper's [start, end) window.
  const before = await surplusAt(options.startTimestamp - 1);
  const after = await surplusAt(options.endTimestamp - 1);
  const surplus = after - before;
  if (surplus < 0n) throw new Error('Cool Eggs surplus counter decreased');
  dailyFees.addGasToken(surplus, SURPLUS);
  dailyRevenue.addGasToken(surplus, `${SURPLUS} To Treasury`);

  const txs = await pageToncenterTxs({ account: TOURNAMENT,
    startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp });
  for (const tx of txs) {
    if (tx.description?.aborted || !tx.description?.compute_ph?.success || !tx.description?.action?.success) continue;
    for (const message of tx.out_msgs ?? []) {
      // AllocationRecorded#1ff02422, using the schema documented in allocationTreasuryShare.
      if (message.opcode !== '0x1ff02422' || message.destination !== null) continue;
      const treasuryShare = allocationTreasuryShare(message.message_content.body);
      dailyFees.addGasToken(treasuryShare, SALES);
      dailyRevenue.addGasToken(treasuryShare, `${SALES} To Treasury`);
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
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const feeSources = {
  [SALES]: 'Treasury half of each Egg purchase price, from successful AllocationRecorded logs; free Egg claims contribute zero. The other half funds the prize pool and is not counted.',
  [SURPLUS]: 'Treasury half of the unused TON players attach to duels, mints and claims, which the game keeps instead of refunding (increase in the tournament protocolShare counter, after execution costs). The other half funds the prize pool and is not counted.',
  [PARTNER]: 'Successful incoming campaign payments to the treasury with the Cool Eggs partner campaign/operation comment. Each message is counted once; tournament payouts and treasury self-transfers are excluded.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.TON],
  start: '2026-10-30',
  fetch,
  methodology: {
    Fees: 'The treasury half of Egg sales and of the unused TON players attach to duels, mints and claims, plus Partner campaign payments to the treasury. The other half of sales and unused TON goes into the player prize pool and is not counted, since it is paid back to players. Excludes network costs, refunds, prize top-ups and secondary NFT sales.',
    Revenue: 'The treasury half of Egg sales and of the unused TON players attach to duels, mints and claims, plus 100% of Partner campaign payments, all kept by the treasury.',
    ProtocolRevenue: 'The treasury half of Egg sales and of the unused TON players attach to duels, mints and claims, plus 100% of Partner campaign payments, all sent to the treasury.',
  },
  breakdownMethodology: {
    Fees: feeSources,
    Revenue: { [`${SALES} To Treasury`]: 'Treasury half of each Egg purchase, recorded in purchase logs.', [`${SURPLUS} To Treasury`]: 'Treasury half of unused TON kept from player actions (increase in the protocolShare counter).', [`${PARTNER} To Treasury`]: 'Full campaign payment retained by the treasury.' },
    ProtocolRevenue: { [`${SALES} To Treasury`]: 'Treasury half of each Egg purchase, recorded in purchase logs.', [`${SURPLUS} To Treasury`]: 'Treasury half of unused TON kept from player actions (increase in the protocolShare counter).', [`${PARTNER} To Treasury`]: 'Full campaign payment retained by the treasury.' },
  },
};

export default adapter;
