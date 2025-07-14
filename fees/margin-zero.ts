import { SimpleAdapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { gql, request } from "graphql-request";
import { Contract, JsonRpcProvider } from "ethers";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm58q8wq01kbk01ts09lc52kp/subgraphs/mz-subgraph/main/gn";
const RPC_URL = "https://sonic.drpc.org";

const callAssetAbi = ["function callAsset() view returns (address)"];
const putAssetAbi = ["function putAsset() view returns (address)"];
const decimalsAbi = ["function decimals() view returns (uint8)"];

const provider = new JsonRpcProvider(RPC_URL);

const marketInfoCache: Record<string, { token: string; decimals: number }> = {};
async function fetchMarketInfo(market: string, isCall: boolean) {
  const key = `${market}-${isCall}`;
  if (marketInfoCache[key]) return marketInfoCache[key];

  const marketContract = new Contract(
    market,
    isCall ? callAssetAbi : putAssetAbi,
    provider
  );
  const token = await marketContract[isCall ? "callAsset" : "putAsset"]();
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

const fetchFn = async (timestamp: number): Promise<FetchResultFees> => {
  const startOfDay = getTimestampAtStartOfDayUTC(timestamp);
  const endOfDay = startOfDay + 86400;

  const { optionsPositions } = await request(
    SUBGRAPH_URL,
    OPTIONS_QUERY(startOfDay, endOfDay)
  );

  // aggregate raw BigInts per token
  const premiums: Record<string, bigint> = {};
  const revenues: Record<string, bigint> = {};
  const tokens = new Set<string>();

  for (const pos of optionsPositions) {
    const rawPremium = BigInt(pos.premium);
    const rawRevenue = BigInt(pos.protocolFees);
    const { token } = await fetchMarketInfo(pos.market, pos.isCall);
    const addr = token.toLowerCase();

    tokens.add(addr);
    premiums[addr] = (premiums[addr] || 0n) + rawPremium;
    revenues[addr] = (revenues[addr] || 0n) + rawRevenue;
  }

  // fetch USD prices
  const priceIds = Array.from(tokens).map((a) => `${CHAIN.SONIC}:${a}`);
  const prices = await getPrices(priceIds, timestamp);

  let totalFeesUSD = 0;
  let totalRevenueUSD = 0;

  for (const addr of tokens) {
    const key = `${CHAIN.SONIC}:${addr}`;
    const data = prices[key];
    if (!data?.price || !data?.decimals) continue;

    const priceScaled = BigInt(Math.round(data.price * 1e6));
    const factor = 10n ** BigInt(data.decimals);

    // total fees = premium + protocolFees
    const feeRaw = (premiums[addr] || 0n) + (revenues[addr] || 0n);
    // revenue only = protocolFees
    const revRaw = revenues[addr] || 0n;

    const feesScaled = (feeRaw * priceScaled) / factor;
    const revScaled = (revRaw * priceScaled) / factor;

    totalFeesUSD += Number(feesScaled) / 1e6;
    totalRevenueUSD += Number(revScaled) / 1e6;
  }

  return {
    timestamp,
    dailyFees: totalFeesUSD.toFixed(2),
    dailyRevenue: totalRevenueUSD.toFixed(2),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: fetchFn,
      start: 1735228800,
      meta: {
        methodology: {
          Fees: "Sum of premium + protocol fees from minted options.",
          Revenue: "Protocol revenue from minted options.",
        },
      },
    },
  },
};

export default adapter;
