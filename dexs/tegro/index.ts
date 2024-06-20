import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('Cypy2AGAgWwBUjBtQc6GeoGmibLH75v3eVhC9UPXHcHP'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('793XgZSYH8fTiZUMLYAE7mVkGgh9KGQufQhVjRvEdHn3'),
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('N56YWKqnNPcruU72KM2rxtdFhAAKx2BWgCjZ1gxFokj'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('ExjMBMGp5EDeBBD9Yt43PeZJtKpP29wRs45JXkeCd712'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('7xPJ5PFAhXmqacuRQmftnYYixhqhfMvARZ6onXtbX3nQ'),
}, {
  factoriesName: "totalVolumes",
  dailyVolume: "volume",
  totalVolume: "volume",
  dayData: "dailyVolume"
});

adapters.adapter.ethereum.start = async () => (24 * 60 * 60) * 19600;
adapters.adapter.polygon.start = async () => (24 * 60 * 60) * 19600;
adapters.adapter.avax.start = async () => (24 * 60 * 60) * 19619;
adapters.adapter.bsc.start = async () => (24 * 60 * 60) * 19619;
adapters.adapter.arbitrum.start = async () => (24 * 60 * 60) * 19619;
export default adapters;
