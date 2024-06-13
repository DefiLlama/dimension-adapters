import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('JAcTKhMyEmiz467QXnt9W1cJXBpZqVmVJbPycEJ7f7nR'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('C4gWYKo4aKh993B1GNVuoeApQGj18dJShm2wMf6viihH'),
  // [CHAIN.POLYGON]: 'https://api.thegraph.com/subgraphs/name/complusnetwork/subgraph-matic',
  // [CHAIN.HECO]: 'https://hg2.bitcv.net/subgraphs/name/complusnetwork/subgraph-heco'
}, {
  factoriesName: "complusFactories",
  dayData: "complusDayData"
});

export default adapters;
