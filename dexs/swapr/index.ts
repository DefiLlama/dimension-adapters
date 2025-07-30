import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('CfBvQzwWyg41ceiR3XM64KzJiAKVPML4iztwEaHYdCFw'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('8CtcD8EzHq6YyQrnb4XFz2pnwXVx3nHruj4pcDjHRKpt'),
  [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/dxgraphs/swapr-xdai-v2"
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "swaprFactories",
  dayData: "swaprDayData",
  totalVolume: "totalVolumeUSD",
  dailyVolume: "dailyVolumeUSD"
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.XDAI],
}

export default adapter;