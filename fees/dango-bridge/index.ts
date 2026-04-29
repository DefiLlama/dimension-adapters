import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

const GRAPHQL = "https://api-mainnet.dango.zone/graphql";
const PROTOCOL_FEE_RATE = 0.1;
const MAX_PAGES = 200;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let totalFees = 0;
  let before: string | null = null;
  let page = 0;

  const startTs = options.startTimestamp;
  const endTs = options.endTimestamp;

  while (page < MAX_PAGES) {
    page++;

    const beforeClause = before ? `before: "${before}"` : "";

    const res = await postURL(GRAPHQL, {
      query: `{
        perpsEvents(
          eventType: "order_filled"
          last: 100
          sortBy: BLOCK_HEIGHT_DESC
          ${beforeClause}
        ) {
          nodes { data createdAt }
          pageInfo { hasPreviousPage startCursor }
        }
      }`,
    });

    const nodes = res?.data?.perpsEvents?.nodes || [];
    const pageInfo = res?.data?.perpsEvents?.pageInfo;

    if (!nodes.length) break;

    let shouldStop = false;

    // reverse because `last` returns nodes in ASC order (oldest first)
    for (const node of [...nodes].reverse()) {
      const ts = Math.floor(new Date(node.createdAt).getTime() / 1000);

      if (ts >= endTs) continue;   // too new, skip
      if (ts < startTs) {          // too old, stop
        shouldStop = true;
        break;
      }

      const fee = Math.abs(Number(node.data?.fee || 0));
      totalFees += fee;
    }

    if (shouldStop) break;
    if (!pageInfo?.hasPreviousPage) break;
    before = pageInfo.startCursor;
  }

  dailyFees.addUSDValue(totalFees);
  dailyRevenue.addUSDValue(totalFees * PROTOCOL_FEE_RATE);
  dailySupplySideRevenue.addUSDValue(totalFees * (1 - PROTOCOL_FEE_RATE));

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.DANGO],
  start: "2026-04-07",
  fetch,
  methodology: {
    Fees: "All trading fees from order_filled events (taker + maker) across all Dango perp markets.",
    Revenue: "10% of trading fees retained by Dango protocol treasury (protocol_fee_rate).",
    ProtocolRevenue: "10% of trading fees allocated to the Dango treasury.",
    SupplySideRevenue: "90% of trading fees distributed to vault liquidity providers.",
  },
  breakdownMethodology: {
    Fees: {
      "Trading Fees": "Taker and maker fees from order_filled events across all Dango perp markets.",
    },
    Revenue: {
      "Trading Fees": "10% of all trading fees routed to Dango protocol treasury.",
    },
    ProtocolRevenue: {
      "Trading Fees": "10% of all trading fees allocated to Dango treasury.",
    },
    SupplySideRevenue: {
      "Trading Fees": "90% of all trading fees distributed to vault LPs.",
    },
  },
};

export default adapter;