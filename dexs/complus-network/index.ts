import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('JAcTKhMyEmiz467QXnt9W1cJXBpZqVmVJbPycEJ7f7nR'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('C4gWYKo4aKh993B1GNVuoeApQGj18dJShm2wMf6viihH'),
  // [CHAIN.POLYGON]: 'https://api.thegraph.com/subgraphs/name/complusnetwork/subgraph-matic',
  // [CHAIN.HECO]: 'https://hg2.bitcv.net/subgraphs/name/complusnetwork/subgraph-heco'
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "complusFactories",
  dayData: "complusDayData"
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
}

export default adapter;
