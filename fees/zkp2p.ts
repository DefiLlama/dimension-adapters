import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

// Peer charges no protocol fee. Makers choose a fiat quote and keep any
// positive spread between that quote and the oracle rate when an intent is
// fulfilled. The public protocol indexer computes the realized USD spread per
// intent at settlement time. Negative values are discounts funded by makers,
// not fees paid by users, so they are excluded from the fee dimension.
const INDEXER = "https://indexer.zkp2p.xyz/v1/graphql";
// Keep public-indexer responses bounded at 1,000 rows; the id cursor below
// exhausts larger time windows without relying on offset pagination.
const PAGE_SIZE = 1000;
// The first positive computed maker-spread snapshot is 2025-01-22 UTC. The
// adapter starts one day earlier so DefiLlama's first daily window includes it.
const START_DATE = "2025-01-21";

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
      createdAt: {_gte: "${from}", _lt: "${to}"}
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
  dailyFees.addUSDValue(makerSpreadUsd, "Maker Spread");
  const dailyUserFees = dailyFees.clone(1, "Maker Spread");
  const dailySupplySideRevenue = dailyFees.clone(1, "Maker Spread");

  return { dailyFees, dailyUserFees, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  fetch,
  start: START_DATE,
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
      "Maker Spread":
        "Positive realized quote spread on fulfilled intents, sourced from the public Peer indexer.",
    },
    UserFees: {
      "Maker Spread":
        "Positive realized quote spread paid by users; maker-funded discounts are excluded.",
    },
    SupplySideRevenue: {
      "Maker Spread":
        "Positive realized quote spread paid entirely to Peer makers.",
    },
  },
};

export default adapter;
