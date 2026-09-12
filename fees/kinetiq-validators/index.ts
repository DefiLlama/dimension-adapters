import PromisePool from "@supercharge/promise-pool";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

/**
 * Kinetiq's kHYPE is delegated across a curated validator set. Each validator charges a commission
 * on the staking rewards it produces, and Kinetiq bills every operator back for half of that
 * commission (`invoice_rate_bps`, 5000 on every row to date) under its validator agreements.
 *
 * The commission is deducted on HyperCore before rewards ever reach kHYPE, so it is not part of the
 * `kinetiq-staked-hype` adapter: that one derives its numbers from the kHYPE exchange rate, which
 * already moves net of commission. The two adapters are additive, not overlapping.
 */

const METRICS = {
  ValidatorCommission: "Validator Commission",
  CommissionToOperators: "Validator Commission To Operators",
  CommissionInvoiced: "Validator Commission Invoiced To Kinetiq",
};

const methodology = {
  Fees: "Commission charged by the validators kHYPE delegates to, on the staking rewards they produce for kHYPE.",
  Revenue: "The half of that commission Kinetiq invoices back to each validator operator (invoice_rate_bps, 5000 to date).",
  ProtocolRevenue: "Same as Revenue - the invoiced amount accrues to Kinetiq.",
  SupplySideRevenue: "The half of the commission the validator operators retain for running the nodes.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.ValidatorCommission]: "Validator commission on the staking rewards produced for kHYPE.",
  },
  Revenue: {
    [METRICS.CommissionInvoiced]: "Commission invoiced back to validator operators by Kinetiq.",
  },
  ProtocolRevenue: {
    [METRICS.CommissionInvoiced]: "Commission invoiced back to validator operators by Kinetiq.",
  },
  SupplySideRevenue: {
    [METRICS.CommissionToOperators]: "Commission retained by the validator operators.",
  },
};

// Kinetiq's public keepers API. Every row is derived from a RewardShareTracker
// (0xE5FbA07C7b3CfbC29633f3D3Ab38b36007F35983, HyperEVM) `RewardDistributionQueued` log and carries
// the `tx_hash` / `distribution_id` / `log_index` that produced it, so each amount is auditable
// on-chain: `reward_share_wei * reward_share_bps_at_compute / 10000` equals the `rewardShare` field
// of the referenced log.
//
// The one input that is NOT on HyperEVM is the validator's commission rate at the time of the
// distribution: that is a HyperCore validator parameter, and Hyperliquid's `validatorSummaries`
// exposes only the current value. Re-pricing history with current rates is measurably wrong -
// validator 0x420a4ed7b6bb361da586868adec2f2bb9ab75e66 charged 300 bps on 2026-09-05 and charges
// 1000 bps today, which would overstate that day's invoice for it by 3.6x. The API is used because
// it stores `commission_rate_bps` as it was at each distribution.
const KEEPERS_API = "https://rpc.km.xyz/kinetiq";
const PAGE_SIZE = 500;

interface InvoiceEvent {
  block_timestamp: number;
  commission_wei: string;
  invoice_wei: string;
}

const toHype = (wei: string): number => Number(BigInt(wei)) / 1e18;

async function validatorInvoices(validator: string, fromTimestamp: number, toTimestamp: number): Promise<InvoiceEvent[]> {
  const events: InvoiceEvent[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { items } = await httpGet(`${KEEPERS_API}/validator/${validator}/invoices?limit=${PAGE_SIZE}&offset=${offset}&sort=desc`);
    if (!items?.length) break;
    for (const item of items) {
      const timestamp = Number(item.block_timestamp);
      if (timestamp >= fromTimestamp && timestamp < toTimestamp) events.push(item);
    }
    // Newest first: once a page ends before the window there is nothing older left to collect.
    if (items.length < PAGE_SIZE || Number(items[items.length - 1].block_timestamp) < fromTimestamp) break;
  }
  return events;
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { validators } = await httpGet(`${KEEPERS_API}/invoices/summary`);

  const { results } = await PromisePool.withConcurrency(5)
    .for(validators as { validator: string }[])
    .process(({ validator }) => validatorInvoices(validator, options.fromTimestamp, options.toTimestamp));

  for (const events of results) {
    for (const { commission_wei, invoice_wei } of events) {
      const commission = toHype(commission_wei);
      const invoiced = toHype(invoice_wei);
      dailyFees.addCGToken("hyperliquid", commission, METRICS.ValidatorCommission);
      dailyRevenue.addCGToken("hyperliquid", invoiced, METRICS.CommissionInvoiced);
      dailyProtocolRevenue.addCGToken("hyperliquid", invoiced, METRICS.CommissionInvoiced);
      dailySupplySideRevenue.addCGToken("hyperliquid", commission - invoiced, METRICS.CommissionToOperators);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2026-04-08", // first RewardDistributionQueued log (block 31907253)
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
