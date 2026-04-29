import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

const GRAPHQL = "https://api-mainnet.dango.zone/graphql";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const res = await postURL(GRAPHQL, {
    query: `{ allPerpsPairStats { pairId volume24H } }`,
  });

  const markets = res?.data?.allPerpsPairStats || [];
  let totalVolume = 0;
  for (const market of markets) {
    totalVolume += Number(market.volume24H || 0);
  }

  dailyVolume.addUSDValue(totalVolume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.DANGO],
  start: "2026-04-07",
  fetch,
  runAtCurrTime: true,
  methodology: {
    Volume: "24h perp trading volume across all Dango markets (BTC, ETH, SOL, HYPE).",
  },
};

export default adapter;