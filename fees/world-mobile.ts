import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { blockscoutFeeAdapter2 } from "../helpers/blockscoutFees";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const SEQUENCER_INBOX = '0x3ba9426acc831cdda0dd0b537f6b4e98670bf280';
const LEGACY_ROLLUP = '0x6db7d43375720fff98a50841ddddc80acb07d969';
const BOLD_ROLLUP = '0x851c037df70a208573a2d635744bbedaa21a0959';
const BATCH_POSTER = '0x6ab7eeed9358323832535566d63519932ea0eb6a';
const VALIDATOR = '0xf2d5bbbe92ad85209f9211f354f125df865c99b1';

const BATCH_POSTING_COSTS = 'Base Batch Posting Costs';
const ASSERTION_COSTS = 'Base State Assertion Costs';
const NET_GAS_FEES = 'Gas Fees Net Of Settlement Costs';

const blockscoutFetch = (blockscoutFeeAdapter2(CHAIN.WORLD_MOBILE).adapter as any)[CHAIN.WORLD_MOBILE].fetch;

const getSettlementCosts = async (options: FetchOptions) => {
  const rows = await queryAllium(`
    SELECT
      TO_VARCHAR(COALESCE(SUM(IFF(to_address = '${SEQUENCER_INBOX}', receipt_gas_used * receipt_effective_gas_price + COALESCE(receipt_l1_fee, 0), 0)), 0)) AS batch_posting_wei,
      TO_VARCHAR(COALESCE(SUM(IFF(to_address <> '${SEQUENCER_INBOX}', receipt_gas_used * receipt_effective_gas_price + COALESCE(receipt_l1_fee, 0), 0)), 0)) AS assertion_wei,
      (SELECT COUNT(*) FROM base.raw.transactions
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 60})) AS txs_after_window
    FROM base.raw.transactions
    WHERE from_address IN ('${BATCH_POSTER}', '${VALIDATOR}')
      AND to_address IN ('${SEQUENCER_INBOX}', '${LEGACY_ROLLUP}', '${BOLD_ROLLUP}')
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `);
  const costs = rows?.[0];
  if (!costs || !(Number(costs.txs_after_window) > 0))
    throw new Error(`Allium has not indexed Base past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  return { batchPostingEth: Number(costs.batch_posting_wei) / 1e18, assertionEth: Number(costs.assertion_wei) / 1e18 };
};

const fetch = async (options: FetchOptions) => {
  const [{ dailyFees: gasFees }, costs] = await Promise.all([
    blockscoutFetch(options),
    getSettlementCosts(options),
  ]);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(gasFees, METRIC.TRANSACTION_GAS_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addCGToken('ethereum', costs.batchPostingEth, BATCH_POSTING_COSTS);
  dailySupplySideRevenue.addCGToken('ethereum', costs.assertionEth, ASSERTION_COSTS);

  // no Arbitrum Expansion Program share is deducted: the fee account is an EOA and no revenue share is paid on-chain
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(gasFees, NET_GAS_FEES);
  dailyRevenue.addCGToken('ethereum', -(costs.batchPostingEth + costs.assertionEth), NET_GAS_FEES);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const feeLabels = {
  [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid in WMTX by users for transactions on World Mobile Chain.',
};

const costLabels = {
  [BATCH_POSTING_COSTS]: 'ETH paid on Base by the World Mobile Chain batch poster to post AnyTrust data availability certificates to the SequencerInbox.',
  [ASSERTION_COSTS]: 'ETH paid on Base by the World Mobile Chain validator to post and confirm state assertions on the rollup contract.',
};

const revenueLabels = {
  [NET_GAS_FEES]: 'Gas fees paid in WMTX by users on World Mobile Chain, minus the ETH paid on Base by the batch poster and validator to post batches and state assertions.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.WORLD_MOBILE],
  start: '2025-06-01',
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.ALLIUM],
  allowNegativeValue: true, // revenue goes negative on idle days where the Base gas for heartbeat batches and assertions exceeds the WMTX fees collected
  methodology: {
    Fees: 'Gas fees paid in WMTX by users for transactions on World Mobile Chain.',
    Revenue: 'Gas fees minus the ETH World Mobile Chain pays on Base to post batches and state assertions; the AnyTrust data availability committee is run off-chain and its costs are not deducted.',
    SupplySideRevenue: 'ETH paid on Base by the World Mobile Chain batch poster and validator to settle the chain.',
    ProtocolRevenue: 'Gas fees minus the ETH paid on Base by the batch poster and validator to post batches and state assertions.',
  },
  breakdownMethodology: {
    Fees: feeLabels,
    Revenue: revenueLabels,
    ProtocolRevenue: revenueLabels,
    SupplySideRevenue: costLabels,
  },
};

export default adapter;
