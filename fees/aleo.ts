import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { aleoGet } from "../helpers/aleo";

// Every Aleo transaction pays a base fee plus an optional priority fee, in microcredits.
// credits.aleo `fee_public`/`fee_private` take both from the payer and credit no one, and snarkVM
// then adds only the priority fees of a block's transactions back into that block's staking reward
// (ledger/src/advance.rs: `priority_fee_amount()` -> `block_reward`). So the priority fee is paid
// to stakers and the base fee is burned. Rejected transactions still pay their fee.
// https://github.com/ProvableHQ/snarkVM/blob/mainnet/ledger/src/advance.rs
// https://github.com/ProvableHQ/snarkVM/blob/mainnet/ledger/block/src/helpers/target.rs
const MICROCREDITS_PER_CREDIT = 1e6;

// The explorer indexer writes one row per block, so a window whose last indexed block is further
// than this from its end has not been fully indexed yet. Aleo targets a block every few seconds.
const MAX_INDEXER_LAG_SECONDS = 300;

interface AleoFees {
  block_count: number;
  last_block_timestamp: number | null;
  burned_fees: string;
  priority_fees: string;
}

function isAleoFees(value: unknown): value is AleoFees {
  const fees = value as AleoFees;
  return typeof fees?.block_count === "number"
    && typeof fees.burned_fees === "string"
    && typeof fees.priority_fees === "string";
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  // Sums the indexer's per-block fee totals over [start, end).
  // https://docs.provable.com/docs/api/v2/intro
  const fees = await aleoGet(`/metrics/fees?start=${startTimestamp}&end=${endTimestamp}`);
  if (!isAleoFees(fees)) throw new Error(`Unexpected /metrics/fees response: ${JSON.stringify(fees)}`);

  if (!fees.block_count || (fees.last_block_timestamp ?? 0) < endTimestamp - MAX_INDEXER_LAG_SECONDS)
    throw new Error(`Aleo indexer has not reached ${endTimestamp} yet (last indexed block at ${fees.last_block_timestamp})`);

  const burned = Number(fees.burned_fees) / MICROCREDITS_PER_CREDIT;
  const priority = Number(fees.priority_fees) / MICROCREDITS_PER_CREDIT;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addCGToken("aleo", burned, METRIC.TRANSACTION_BASE_FEES);
  dailyFees.addCGToken("aleo", priority, METRIC.TRANSACTION_PRIORITY_FEES);
  dailyRevenue.addCGToken("aleo", burned, METRIC.TRANSACTION_BASE_FEES);
  dailySupplySideRevenue.addCGToken("aleo", priority, METRIC.TRANSACTION_PRIORITY_FEES);

  return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ALEO],
  // Mainnet genesis block timestamp.
  start: "2024-09-04",
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Transaction fees (base fees + priority fees) paid by users, including fees paid by rejected transactions",
    Revenue: "Base fees, which are burned",
    HoldersRevenue: "Base fees, which are burned",
    SupplySideRevenue: "Priority fees, which are added to the block reward and paid to stakers",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: "Base fees paid by users",
      [METRIC.TRANSACTION_PRIORITY_FEES]: "Priority fees paid by users",
    },
    Revenue: {
      [METRIC.TRANSACTION_BASE_FEES]: "Base fees burned",
    },
    HoldersRevenue: {
      [METRIC.TRANSACTION_BASE_FEES]: "Base fees burned",
    },
    SupplySideRevenue: {
      [METRIC.TRANSACTION_PRIORITY_FEES]: "Priority fees paid to stakers through the block reward",
    },
  },
};

export default adapter;
