import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.FANTOM]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/C5XUzYLrDHiiKL7zGjLLyiQueJkQfeUyMZCcgwnVWcNr`
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
  gasToken: "coingecko:fantom"
});

adapters.adapter.fantom.start = 1636106400;
export default adapters;
