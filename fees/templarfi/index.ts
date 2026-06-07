import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { nearViewCall } from "../../helpers/near";

const REGISTRY = "v1.tmplr.near";

// Fraction of a year per millisecond
const YEAR_PER_MS = new BigNumber("0.00000000003168873850681143096456210346");

const SNAPSHOT_PAGE = 200;

async function listMarkets(): Promise<string[]> {
  const deployments: string[] = [];
  let offset = 0;
  const count = 100;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch: string[] = await nearViewCall(REGISTRY, "list_deployments", { offset, count });
    if (!Array.isArray(batch) || batch.length === 0) break;
    deployments.push(...batch);
    if (batch.length < count) break;
    offset += count;
  }
  // Skip known non-market deployments
  return deployments.filter(
    (d) => !d.startsWith("proxy-oracle-") && !d.startsWith("liqtest-") && d !== "redstone-adapter." + REGISTRY,
  );
}

// Gross borrower interest (raw borrow-asset units) accrued in [fromMs, toMs].
// Each snapshot holds (borrowed, interest_rate) over (prev end, this end], we
// attribute each interval's interest to its overlap with the query window.
async function marketInterest(market: string, fromMs: number, toMs: number): Promise<BigNumber> {
  const len: number = await nearViewCall(market, "get_finalized_snapshots_len");
  if (!len || len === 0) return new BigNumber(0);

  let snaps: any[] = [];
  let offset = Math.max(0, len - SNAPSHOT_PAGE);
  while (true) {
    const page = await nearViewCall(market, "list_finalized_snapshots", { offset, count: Math.min(SNAPSHOT_PAGE, len - offset) });
    if (!Array.isArray(page) || page.length === 0) break;
    snaps = page.concat(snaps);
    if (offset === 0 || Number(page[0].end_timestamp_ms) <= fromMs) break;
    offset = Math.max(0, offset - SNAPSHOT_PAGE);
  }

  let total = new BigNumber(0);
  let prevEnd: number | null = null;
  for (const s of snaps) {
    const end = Number(s.end_timestamp_ms);
    if (prevEnd !== null) {
      const overlapMs = Math.min(end, toMs) - Math.max(prevEnd, fromMs);
      if (overlapMs > 0) {
        total = total.plus(
          new BigNumber(s.borrow_asset_borrowed).times(s.interest_rate).times(overlapMs).times(YEAR_PER_MS),
        );
      }
    }
    prevEnd = end;
  }

  return total;
}

const fetch = async (options: FetchOptions) => {
  const { fromTimestamp, toTimestamp, createBalances } = options;
  const fromMs = fromTimestamp * 1000;
  const toMs = toTimestamp * 1000;

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const markets = await listMarkets();

  await Promise.all(
    markets.map(async (market) => {
      let config: any;
      try {
        config = await nearViewCall(market, "get_configuration");
      } catch {
        return; // not a market
      }
      const yieldWeights = config?.yield_weights;
      const decimals = config?.price_oracle_configuration?.borrow_asset_decimals;
      if (!yieldWeights || decimals === undefined) return;

      const supplyWeight = new BigNumber(yieldWeights.supply);
      const staticWeight = Object.values(yieldWeights.static || {}).reduce(
        (acc: BigNumber, w: any) => acc.plus(w),
        new BigNumber(0),
      );
      const totalWeight = supplyWeight.plus(staticWeight);
      if (totalWeight.isZero()) return;

      const interestRaw = await marketInterest(market, fromMs, toMs);
      if (interestRaw.isZero()) return;

      const scale = new BigNumber(10).pow(decimals);
      const feesUsd = interestRaw.div(scale);
      dailyFees.addUSDValue(feesUsd.toNumber());
      dailySupplySideRevenue.addUSDValue(feesUsd.times(supplyWeight).div(totalWeight).toNumber());
      dailyProtocolRevenue.addUSDValue(feesUsd.times(staticWeight).div(totalWeight).toNumber());
    }),
  );

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  start: "2025-08-11",
  adapter: {
    [CHAIN.NEAR]: {
      fetch,
    },
  },
  methodology: {
    Fees: "Gross interest accrued by borrowers across all Templar lending markets, derived from on-chain market snapshots (borrowed amount x interest rate x time).",
    Revenue: "Protocol's share of borrower interest (the static yield weight), sent to the Templar treasury (revenue.tmplr.near).",
    ProtocolRevenue: "Protocol's share of borrower interest (the static yield weight), sent to the Templar treasury (revenue.tmplr.near).",
    SupplySideRevenue: "Borrower interest distributed to suppliers/lenders (the supply yield weight).",
  },
};

export default adapter;
