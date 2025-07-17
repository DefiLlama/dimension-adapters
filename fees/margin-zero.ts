import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, request } from "graphql-request";
import { Contract, JsonRpcProvider } from "ethers";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm58q8wq01kbk01ts09lc52kp/subgraphs/mz-subgraph/main/gn";
const RPC_URL = "https://sonic.drpc.org";

const callAssetAbi = ["function callAsset() view returns (address)"];
const putAssetAbi  = ["function putAsset() view returns (address)"];
const decimalsAbi  = ["function decimals() view returns (uint8)"];

const provider = new JsonRpcProvider(RPC_URL);

// cache market → { token, decimals }
const marketInfoCache: Record<string, { token: string; decimals: number }> = {};
async function fetchMarketInfo(market: string, isCall: boolean) {
  const key = `${market}-${isCall}`;
  if (marketInfoCache[key]) return marketInfoCache[key];

  const marketContract = new Contract(
    market,
    isCall ? callAssetAbi : putAssetAbi,
    provider
  );
  const token    = await marketContract[isCall ? "callAsset" : "putAsset"]();
  const tokenContract = new Contract(token, decimalsAbi, provider);
  const decimals = await tokenContract.decimals();

  return (marketInfoCache[key] = { token, decimals });
}

const OPTIONS_QUERY = (start: number, end: number) => gql`
  {
    optionsPositions(
      where: { mintTimestamp_gte: ${start}, mintTimestamp_lt: ${end} }
    ) {
      premium
      protocolFees
      market
      isCall
    }
  }
`;

const fetchFn = async (
  timestamp: number
): Promise<{
  timestamp: number;
  dailyFees: string;
  dailyRevenue: string;
  dailyVolume: string;
}> => {
  const startOfDay = getTimestampAtStartOfDayUTC(timestamp);
  const endOfDay   = startOfDay + 86400;

  const { optionsPositions } = await request(
    SUBGRAPH_URL,
    OPTIONS_QUERY(startOfDay, endOfDay)
  );

  // Raw aggregators per token
  const rawFees:    Record<string, bigint> = {}; // protocolFees only
  const rawVolume:  Record<string, bigint> = {}; // premium + protocolFees
  const tokens = new Set<string>();

  for (const pos of optionsPositions) {
    const pf    = BigInt(pos.protocolFees);
    const prem  = BigInt(pos.premium);
    const { token } = await fetchMarketInfo(pos.market, pos.isCall);
    const addr = token.toLowerCase();

    tokens.add(addr);
    rawFees[addr]   = (rawFees[addr]   || 0n) + pf;
    rawVolume[addr] = (rawVolume[addr] || 0n) + (pf + prem);
  }

  // Fetch USD prices
  const priceIds = Array.from(tokens).map((a) => `${CHAIN.SONIC}:${a}`);
  const prices   = await getPrices(priceIds, timestamp);

  let totalFeesUSD    = 0;
  let totalVolumeUSD  = 0;

  for (const addr of tokens) {
    const key  = `${CHAIN.SONIC}:${addr}`;
    const d    = prices[key];
    if (!d?.price || !d?.decimals) continue;

    const priceScaled = BigInt(Math.round(d.price * 1e6));
    const factor      = 10n ** BigInt(d.decimals);

    const feeScaled   = (rawFees[addr]   * priceScaled) / factor;
    const volScaled   = (rawVolume[addr] * priceScaled) / factor;

    totalFeesUSD   += Number(feeScaled) / 1e6;
    totalVolumeUSD += Number(volScaled) / 1e6;
  }

  const daily = {
    timestamp,
    dailyFees:    totalFeesUSD.toFixed(2),
    dailyRevenue: totalFeesUSD.toFixed(2),
    dailyVolume:  totalVolumeUSD.toFixed(2),
  };
  return daily;
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: fetchFn,
      start: 1735228800, // subgraph deployment
      meta: {
        methodology: {
          Revenue: "Protocol revenue from minted options.",
          Volume: "Total notional (sum of premium + protocolFees) from minted options. ",
        },
      },
    },
  },
};

export default adapter;
