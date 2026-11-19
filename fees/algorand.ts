import { FetchOptions, SimpleAdapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Consensus upgrade that enabled proposer payouts: first block is round 46512890 (2025-01-23T13:58:52Z).
// https://dev.algorand.co/concepts/protocol/staking-rewards/
// Before it no fees were paid out of the fee sink, so there is nothing to subtract.
const PAYOUTS_START = 1737640732;
const FEES_TO_PROPOSERS = 'Transaction Fees To Block Proposers';
const FEES_TO_FEE_SINK = 'Transaction Fees To Fee Sink';

const toMicroAlgos = (value: any, field: string, round: number): number => {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`algorand: bad ${field} ${value} in block ${round}`);
  return value;
};

// Fee share of the proposer payout in every block of the window. An eligible proposer gets
// bonus + 50% of fees-collected out of the fee sink, an ineligible one gets nothing (no proposer-payout field).
const getProposerFees = async (startDate: string, endDate: string) => {
  let proposerFees = 0;
  let feesCollected = 0;
  let nextToken: string | undefined = undefined;
  let requestCount = 0;
  const MAX_REQUESTS = 100;

  do {
    let url = `https://mainnet-idx.algonode.cloud/v2/block-headers?after-time=${startDate}&before-time=${endDate}&limit=1000`;
    if (nextToken) url += `&next=${nextToken}`;

    const response = await httpGet(url);
    const blocks = response.blocks;
    if (!Array.isArray(blocks)) throw new Error(`algorand: no blocks in block-headers response between ${startDate} and ${endDate}`);
    if (requestCount >= MAX_REQUESTS && blocks.length) {
      throw new Error(`algorand: more than ${MAX_REQUESTS} pages of block headers between ${startDate} and ${endDate}, refusing to publish a partial sum`);
    }

    for (const block of blocks) {
      const blockFees = toMicroAlgos(block['fees-collected'], 'fees-collected', block.round);
      feesCollected += blockFees;
      const payout = toMicroAlgos(block['proposer-payout'], 'proposer-payout', block.round);
      if (!payout) continue;
      const bonus = toMicroAlgos(block.bonus, 'bonus', block.round);
      // payout - bonus is floor(fees-collected / 2) on mainnet today; a payout capped by the fee sink balance has no clean split
      const feeShare = payout - bonus;
      if (feeShare < 0 || feeShare > blockFees) throw new Error(`algorand: proposer payout ${payout} in block ${block.round} does not split into bonus ${bonus} + a share of fees ${blockFees}`);
      proposerFees += feeShare;
    }

    nextToken = response['next-token'];
    requestCount++;
    if (!blocks.length) break;
  } while (nextToken);

  return { proposerFees, feesCollected };
};

const innerTxnFees = (txn: any): number =>
  (txn['inner-txns'] || []).reduce((sum: number, inner: any) => sum + (typeof inner.fee === 'number' ? inner.fee : 0) + innerTxnFees(inner), 0);

/**
 * Fetches Algorand blockchain transaction fees using AlgoNode's public API
 * and aggregates them for the given time period
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Convert to ISO format for the API
  const startDate = new Date((options.startTimestamp - 1) * 1000).toISOString();
  const endDate = new Date(options.endTimestamp * 1000).toISOString();

  let totalFees = 0;
  let nextToken: string | undefined = undefined;
  let requestCount = 0;
  const MAX_REQUESTS = 1000;

  // Query transactions from AlgoNode public indexer (more reliable)
  do {
    let url = `https://mainnet-idx.algonode.cloud/v2/transactions?after-time=${startDate}&before-time=${endDate}&limit=1000`;
    if (nextToken) {
      url += `&next=${nextToken}`;
    }

    const response = await httpGet(url);
    const txns = response.transactions || [];
    if (requestCount >= MAX_REQUESTS && txns.length) {
      throw new Error(`algorand: more than ${MAX_REQUESTS} pages of transactions between ${startDate} and ${endDate}, refusing to publish a partial sum`);
    }

    // Sum all transaction fees (fees are in microAlgos)
    for (const txn of txns) {
      if (txn.fee && typeof txn.fee === 'number') {
        totalFees += txn.fee;
      }
      totalFees += innerTxnFees(txn);
    }

    nextToken = response['next-token'];
    requestCount++;

    if (!nextToken || txns.length === 0) {
      break;
    }
  } while (nextToken);

  const { proposerFees, feesCollected } = options.endTimestamp > PAYOUTS_START ? await getProposerFees(startDate, endDate) : { proposerFees: 0, feesCollected: 0 };
  // headers carry fees-collected only after the upgrade; it must match the transaction scan, or the two indexer reads saw different blocks
  if (options.startTimestamp >= PAYOUTS_START && feesCollected !== totalFees) {
    throw new Error(`algorand: block headers collected ${feesCollected} in fees but transactions paid ${totalFees} between ${startDate} and ${endDate}`);
  }
  if (proposerFees > totalFees) {
    throw new Error(`algorand: proposer fee share ${proposerFees} exceeds transaction fees ${totalFees} between ${startDate} and ${endDate}`);
  }

  // Convert from microAlgos to ALGO (1 ALGO = 1,000,000 microAlgos)
  dailyFees.addCGToken('algorand', totalFees / 1e6, 'Transaction Fees');
  dailySupplySideRevenue.addCGToken('algorand', proposerFees / 1e6, FEES_TO_PROPOSERS);
  dailyRevenue.addCGToken('algorand', (totalFees - proposerFees) / 1e6, FEES_TO_FEE_SINK);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "All transaction fees paid by users on the Algorand blockchain",
  Revenue: "Transaction fees kept in the fee sink, the protocol account all fees are paid to. Algorand does not burn fees.",
  ProtocolRevenue: "Transaction fees kept in the fee sink, a protocol account whose spending is restricted by consensus rules.",
  SupplySideRevenue: "Since the 2025-01-23 consensus upgrade, eligible block proposers are paid 50% of their block's fees out of the fee sink. Proposer bonuses are not fees and are excluded.",
  HoldersRevenue: "No transaction fees are burned or distributed to ALGO holders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ALGORAND],
  start: '2019-06-11', // Algorand mainnet launch date
  protocolType: ProtocolType.CHAIN,
  methodology,
  breakdownMethodology: {
    Fees: {
      'Transaction Fees': 'All transaction fees paid by users on the Algorand blockchain',
    },
    Revenue: {
      [FEES_TO_FEE_SINK]: 'Transaction fees kept in the fee sink after proposer payouts',
    },
    ProtocolRevenue: {
      [FEES_TO_FEE_SINK]: 'Transaction fees kept in the fee sink after proposer payouts',
    },
    SupplySideRevenue: {
      [FEES_TO_PROPOSERS]: 'Fee share of proposer payouts (proposer-payout minus bonus in each block header), 50% of the fees of each block with an eligible proposer',
    },
  },
};

export default adapter;
