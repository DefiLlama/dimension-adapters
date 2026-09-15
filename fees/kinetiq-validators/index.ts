import { PromisePool } from "@supercharge/promise-pool";
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
  TokenBuyBack: "Token Buy Back",
};

const methodology = {
  Fees: "Commission charged by the validators kHYPE delegates to, on the staking rewards they produce for kHYPE.",
  Revenue: "The half of that commission Kinetiq invoices back to each validator operator (invoice_rate_bps, 5000 to date).",
  ProtocolRevenue: "30% of the invoiced amount, kept by the treasury from 2026-04-09.",
  SupplySideRevenue: "The half of the commission the validator operators retain for running the nodes.",
  HoldersRevenue: "70% of the invoiced amount, used to buy back KNTQ for sKNTQ holders from 2026-04-09.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.ValidatorCommission]: "Validator commission on the staking rewards produced for kHYPE.",
  },
  Revenue: {
    [METRICS.CommissionInvoiced]: "Commission invoiced back to validator operators by Kinetiq.",
  },
  ProtocolRevenue: {
    [METRICS.CommissionInvoiced]: "30% of the invoiced commission, kept by the treasury.",
  },
  SupplySideRevenue: {
    [METRICS.CommissionToOperators]: "Commission retained by the validator operators.",
  },
  HoldersRevenue: {
    [METRICS.TokenBuyBack]: "70% of the invoiced commission, used to buy back KNTQ for sKNTQ holders.",
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
const REQUEST_TIMEOUT = 10000;

// Kinetiq's treasury policy since 2026-04-09: 30% of revenue is kept by the protocol and 70% buys
// back KNTQ for sKNTQ holders. The same split the kinetiq-staked-hype adapter already encodes;
// this adapter's first distribution is 2026-04-08, so one day precedes the policy and is
// immaterial against the window.
const PROTOCOL_SHARE = 0.3;
const HOLDERS_SHARE = 0.7;

interface InvoiceEvent {
  block_timestamp: number;
  commission_wei: string;
  invoice_wei: string;
}

const toHype = (wei: string): number => Number(BigInt(wei)) / 1e18;

async function validatorInvoices(validator: string, fromTimestamp: number, toTimestamp: number): Promise<InvoiceEvent[]> {
  const events: InvoiceEvent[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { items } = await httpGet(
      `${KEEPERS_API}/validator/${validator}/invoices?limit=${PAGE_SIZE}&offset=${offset}&sort=desc`,
      { timeout: REQUEST_TIMEOUT },
    );
    // A missing or non-array `items` is a broken response, not an empty page. Breaking on it would
    // silently book the validator at zero for the day, so it fails loudly instead.
    if (!Array.isArray(items)) throw new Error(`keepers invoices returned no items array for ${validator}`);
    if (!items.length) break;
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
  const dailyHoldersRevenue = options.createBalances();

  const { validators } = await httpGet(`${KEEPERS_API}/invoices/summary`);

  const { results, errors } = await PromisePool.withConcurrency(5)
    .for(validators as { validator: string }[])
    .process(({ validator }) => validatorInvoices(validator, options.fromTimestamp, options.toTimestamp));

  // The pool collects rejections instead of throwing. Swallowing them would drop whole validators
  // from the day and report the remainder as if it were the total.
  if (errors.length) throw errors[0].raw ?? errors[0];

  for (const events of results) {
    for (const { commission_wei, invoice_wei } of events) {
      const commission = toHype(commission_wei);
      const invoiced = toHype(invoice_wei);
      dailyFees.addCGToken("hyperliquid", commission, METRICS.ValidatorCommission);
      dailyRevenue.addCGToken("hyperliquid", invoiced, METRICS.CommissionInvoiced);
      dailyProtocolRevenue.addCGToken("hyperliquid", invoiced * PROTOCOL_SHARE, METRICS.CommissionInvoiced);
      dailyHoldersRevenue.addCGToken("hyperliquid", invoiced * HOLDERS_SHARE, METRICS.TokenBuyBack);
      dailySupplySideRevenue.addCGToken("hyperliquid", commission - invoiced, METRICS.CommissionToOperators);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyHoldersRevenue };
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
