import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.BSC]: "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/2MF3GHhPgvCk8ZHBso8uxTkcT97zjmoEPfxkbeH4D7Jb",
};
const adapter = univ2Adapter(endpoints, {});

adapter.adapter.bsc.start = 1631404800;

export default adapter
