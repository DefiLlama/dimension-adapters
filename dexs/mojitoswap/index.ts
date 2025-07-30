import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.KCC]: "https://thegraph.kcc.network/subgraphs/name/mojito/swap",
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "uniswapFactories",
  dayData: "uniswapDayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD"
});

const adapter: SimpleAdapter = {
  chains: [CHAIN.KCC],
  fetch,
  start: 1634200191,
}

export default adapter;
