import request, { gql } from "graphql-request";
import type {
  FetchResultFees,
  FetchResultVolume,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoint = "https://dex-explorer.rivrdex.io/graphql";
const swapFeeRate = 0.003;

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

async function fetch(): Promise<FetchResultVolume & FetchResultFees> {
  const { allPairs } = await request<PairsResponse>(endpoint, query);
  const pairs = allPairs?.nodes;

  if (!pairs || pairs.length === 0) throw new Error("RivrDEX API returned no pairs");

  const dailyVolume = pairs.reduce((total, pair) => {
    const volume = Number(pair.volume24H);
    if (!Number.isFinite(volume) || volume < 0)
      throw new Error(`RivrDEX API returned invalid 24h volume: ${pair.volume24H}`);
    return total + volume;
  }, 0);

  return {
    dailyVolume,
    dailyFees: dailyVolume * swapFeeRate,
  };
}

const adapter: SimpleAdapter = {
  chains: [CHAIN.VARA],
  fetch,
  start: "2026-06-17",
  runAtCurrTime: true,
  methodology: {
    Fees: "0.3% swap fee paid by traders, calculated from the rolling 24h volume reported by the RivrDEX API.",
  },
};

export default adapter;
