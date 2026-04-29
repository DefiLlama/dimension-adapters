import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

const GRAPHQL = "https://api-mainnet.dango.zone/graphql";
const PERPS_CONTRACT = "0x90bc84df68d1aa59a857e04ed529e9a26edbea4f";
const MAX_PAGES = 200;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const emptyResult = () => ({
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  });

  let paramsRes;
  try {
    paramsRes = await postURL(GRAPHQL, {
      query: `{
        queryApp(request: {
          wasm_smart: {
            contract: "${PERPS_CONTRACT}"
            msg: { param: {} }
          }
        })
      }`,
    });
  } catch (e) {
    console.error("fees/dango-bridge: failed to fetch protocol params", e);
    return emptyResult();
  } 

  const params = paramsRes?.data?.queryApp?.wasm_smart;
  const protocolFeeRate = Number(params?.protocol_fee_rate);

  if (!Number.isFinite(protocolFeeRate) || protocolFeeRate < 0 || protocolFeeRate > 1) {
    console.error(`Invalid protocol_fee_rate: ${params?.protocol_fee_rate}`);
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  }

  let totalFees = 0;
  let before: string | null = null;
  let page = 0;
  let reachedLowerBound = false;

  const startTs = options.startTimestamp;
  const endTs = options.endTimestamp;

  while (page < MAX_PAGES) {
    page++;
    const beforeClause = before ? `before: "${before}"` : "";

    let res;
    try {
      res = await postURL(GRAPHQL, {
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
    } catch (e) {
      console.error(`dango-bridge fees: failed to fetch perpsEvents page ${page}`, e);
      return emptyResult();
    }

    const nodes = res?.data?.perpsEvents?.nodes || [];
    const pageInfo = res?.data?.perpsEvents?.pageInfo;

    if (!nodes.length) { reachedLowerBound = true; break; }

    for (const node of [...nodes].reverse()) {
      const ts = Math.floor(new Date(node.createdAt).getTime() / 1000);
      if (ts >= endTs) continue;
      if (ts < startTs) { reachedLowerBound = true; break; }
      totalFees += Math.abs(Number(node.data?.fee || 0));
    }

    if (reachedLowerBound) break;
    if (!pageInfo?.hasPreviousPage) { reachedLowerBound = true; break; }
    before = pageInfo.startCursor;
  }

  if (!reachedLowerBound) {
    throw new Error(
      `Dango fees: pagination hit MAX_PAGES (${MAX_PAGES}) before reaching startTs ${startTs}. Fees would be truncated — aborting.`
    );
  }

  dailyFees.addUSDValue(totalFees, "Trading Fees");
  dailyRevenue.addUSDValue(totalFees * protocolFeeRate, "Trading Fees");
  dailySupplySideRevenue.addUSDValue(totalFees * (1 - protocolFeeRate), "Trading Fees");

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
    Fees: "Actual trading fees from order_filled events (taker + maker) across all Dango perp markets.",
    Revenue: "Protocol share of fees per on-chain protocol_fee_rate.",
    ProtocolRevenue: "Protocol share allocated to Dango treasury.",
    SupplySideRevenue: "Remaining fees distributed to vault LPs.",
  },
  breakdownMethodology: {
    Fees: {
      "Trading Fees": "Taker and maker fees from order_filled events.",
    },
    Revenue: {
      "Trading Fees": "Protocol share of trading fees per on-chain protocol_fee_rate.",
    },
    ProtocolRevenue: {
      "Trading Fees": "Protocol share allocated to Dango treasury.",
    },
    SupplySideRevenue: {
      "Trading Fees": "Fees distributed to vault LPs.",
    },
  },
};

export default adapter;