import request, { gql } from "graphql-request";
import type {
  FetchOptions,
  FetchResultV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const endpoint = "https://dex-explorer.rivrdex.io/graphql";
// Official fee schedule (0.35% total, with 0.30% paid to LPs):
// https://app.rivrdex.io/explore and https://app.rivrdex.io/trade
const lpFeeRate = 0.003; // 0.30% LP fee.
const protocolFeeRate = 0.0005; // 0.05% protocol fee (the remainder of the total fee).
const totalFeeRate = lpFeeRate + protocolFeeRate;

interface Pair {
  volume24H: string;
}

interface PairsResponse {
  allPairs: {
    nodes: Pair[];
  };
}

const query = gql`
  query GetPairs {
    allPairs {
      nodes {
        volume24H
      }
    }
  }
`;

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const { allPairs } = await request<PairsResponse>(endpoint, query);
  const pairs = allPairs?.nodes;

  if (!pairs || pairs.length === 0) throw new Error("RivrDEX API returned no pairs");

  const dailyVolume = pairs.reduce((total, pair) => {
    const volume = Number(pair.volume24H);
    if (!Number.isFinite(volume) || volume < 0)
      throw new Error(`RivrDEX API returned invalid 24h volume: ${pair.volume24H}`);
    return total + volume;
  }, 0);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(dailyVolume * totalFeeRate, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(dailyVolume * protocolFeeRate, "Token Swap Fees to Protocol");
  dailySupplySideRevenue.addUSDValue(dailyVolume * lpFeeRate, "Token Swap Fees to LPs");

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "0.35% total swap fee paid by traders, calculated from the rolling 24h volume reported by the RivrDEX API.",
  Revenue: "0.05% of swap volume is collected by the protocol.",
  ProtocolRevenue: "0.05% of swap volume is collected by the protocol.",
  SupplySideRevenue: "0.3% of swap volume is distributed to liquidity providers.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "0.35% total swap fee paid by traders, calculated from the rolling 24h volume reported by the RivrDEX API.",
  },
  Revenue: {
    "Token Swap Fees to Protocol": "0.05% of swap volume is collected by the protocol.",
  },
  ProtocolRevenue: {
    "Token Swap Fees to Protocol": "0.05% of swap volume is collected by the protocol.",
  },
  SupplySideRevenue: {
    "Token Swap Fees to LPs": "0.3% of swap volume is distributed to liquidity providers.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.VARA],
  fetch,
  start: "2026-06-17",
  runAtCurrTime: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
