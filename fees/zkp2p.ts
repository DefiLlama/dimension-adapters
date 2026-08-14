import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { postURL } from "../utils/fetchURL";

// Peer charges no protocol fee. Makers choose a fiat quote and keep any
// positive spread between that quote and the oracle rate when an intent is
// fulfilled. The public protocol indexer computes the realized USD spread per
// intent at settlement time. Negative values are discounts funded by makers,
// not fees paid by users, so they are excluded from the fee dimension.
const INDEXER = "https://indexer.zkp2p.xyz/v1/graphql";
const PAGE_SIZE = 1000;

interface MakerProfitRow {
  id: string;
  realizedProfitUsdCents: string;
}

interface MakerProfitResponse {
  MakerProfitSnapshot: MakerProfitRow[];
}

const buildQuery = (from: number, to: number, cursor: string) => `{
  MakerProfitSnapshot(
    where: {
      status: {_eq: COMPUTED}
      createdAt: {_gte: "${from}", _lte: "${to}"}
      realizedProfitUsdCents: {_gt: "0"}
      id: {_gt: "${cursor}"}
    }
    order_by: {id: asc}
    limit: ${PAGE_SIZE}
  ) {
    id
    realizedProfitUsdCents
  }
}`;

const fetch = async (options: FetchOptions) => {
  let cursor = "";
  let makerSpreadUsd = 0;

  while (true) {
    const res: { data: MakerProfitResponse } = await postURL(INDEXER, {
      query: buildQuery(options.fromTimestamp, options.toTimestamp, cursor),
    });
    const rows = res.data.MakerProfitSnapshot;

    for (const row of rows)
      makerSpreadUsd += Number(row.realizedProfitUsdCents) / 100;

    if (rows.length < PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(makerSpreadUsd, METRIC.TRADING_FEES);
  const dailyUserFees = dailyFees.clone(1, METRIC.TRADING_FEES);
  const dailySupplySideRevenue = dailyFees.clone(1, METRIC.LP_FEES);

  return { dailyFees, dailyUserFees, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  fetch,
  start: "2025-01-21",
  methodology: {
    Fees:
      "Positive realized maker spread on fulfilled Peer intents, measured against the oracle rate at settlement. Maker-funded discounts (negative spread) are excluded. Peer charges no separate platform or protocol fee.",
    UserFees:
      "The positive quote spread paid by users when a maker's fulfilled fiat quote is above the oracle rate.",
    SupplySideRevenue:
      "All positive realized spread is earned by the maker that supplied USDC liquidity. None is retained by the Peer protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]:
        "Positive realized quote spread on fulfilled intents, sourced from the public Peer indexer.",
    },
    UserFees: {
      [METRIC.TRADING_FEES]:
        "Positive realized quote spread paid by users; maker-funded discounts are excluded.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]:
        "Positive realized quote spread paid entirely to Peer makers.",
    },
  },
};

export default adapter;
