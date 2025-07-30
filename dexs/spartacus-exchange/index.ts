import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('3kxULFsyJPAqbtCQUtQBH4Hktd6EboqCF22cVtkZg1eY'),
};

const fetch = univ2Adapter({
  endpoints,
  gasToken: "coingecko:fantom",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.FANTOM],
  start: 1650883041,
}

export default adapter;
