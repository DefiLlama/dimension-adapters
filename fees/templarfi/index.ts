import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { nearView } from "../../helpers/near";

const REGISTRY = "v1.tmplr.near";
const MS_PER_YEAR = 365 * 24 * 3600 * 1000;
const SNAPSHOT_PAGE = 200;

async function listMarkets(): Promise<string[]> {
  const deployments: string[] = [];
  let offset = 0;
  const count = 100;
  while (true) {
    const batch: string[] = await nearView(REGISTRY, "list_deployments", { offset, count });
    if (!Array.isArray(batch) || batch.length === 0) break;
    deployments.push(...batch);
    if (batch.length < count) break;
    offset += count;
  }
  return deployments.filter(
    (d) => !d.startsWith("proxy-oracle-") && !d.startsWith("liqtest-") && d !== "redstone-adapter." + REGISTRY,
  );
}

async function marketInterest(market: string, fromMs: number, toMs: number): Promise<number> {
  const len: number = await nearView(market, "get_finalized_snapshots_len");
  if (!len) return 0;

  const snaps: any[] = await nearView(market, "list_finalized_snapshots", {
    offset: Math.max(0, len - SNAPSHOT_PAGE),
    count: Math.min(SNAPSHOT_PAGE, len),
  });
  if (!snaps?.length) return 0;

  let total = 0;
  let prevEnd: number | null = null;
  for (const s of snaps) {
    const end = Number(s.end_timestamp_ms);
    if (prevEnd !== null) {
      const overlap = Math.min(end, toMs) - Math.max(prevEnd, fromMs);
      if (overlap > 0)
        total += Number(s.borrow_asset_borrowed) * Number(s.interest_rate) * overlap / MS_PER_YEAR;
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
      const config = await nearView(market, "get_configuration");
      const yieldWeights = config?.yield_weights;
      const decimals = config?.price_oracle_configuration?.borrow_asset_decimals;
      if (!yieldWeights || decimals === undefined) return;

      const supplyWeight = Number(yieldWeights.supply);
      const staticWeight = (Object.values(yieldWeights.static ?? {}) as number[])
        .reduce((acc, w) => acc + Number(w), 0);
      const totalWeight = supplyWeight + staticWeight;
      if (!totalWeight) return;

      const interestRaw = await marketInterest(market, fromMs, toMs);
      if (!interestRaw) return;

      const feesUsd = interestRaw / 10 ** decimals;
      dailyFees.addUSDValue(feesUsd, METRIC.BORROW_INTEREST);
      dailySupplySideRevenue.addUSDValue(feesUsd * supplyWeight / totalWeight, METRIC.BORROW_INTEREST);
      dailyProtocolRevenue.addUSDValue(feesUsd * staticWeight / totalWeight, METRIC.BORROW_INTEREST);
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
  chains: [CHAIN.NEAR],
  fetch,
  methodology: {
    Fees: "Gross interest accrued by borrowers across all Templar lending markets, derived from on-chain market snapshots (borrowed amount x interest rate x time).",
    Revenue: "Protocol's share of borrower interest (the static yield weight), sent to the Templar treasury (revenue.tmplr.near).",
    ProtocolRevenue: "Protocol's share of borrower interest (the static yield weight), sent to the Templar treasury (revenue.tmplr.near).",
    SupplySideRevenue: "Borrower interest distributed to suppliers/lenders (the supply yield weight).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Gross interest accrued by borrowers across all Templar lending markets.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Protocol's share of borrower interest (the static yield weight), sent to the Templar treasury (revenue.tmplr.near).",
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: "Protocol's share of borrower interest (the static yield weight), sent to the Templar treasury (revenue.tmplr.near).",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Borrower interest distributed to suppliers/lenders (the supply yield weight).",
    },
  },
};

export default adapter;
