import { univ2Adapter } from "../helpers/getUniSubgraphVolume";
import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";

const endpoints = {
  [CHAIN.SAPPHIRE]: 'https://graph.api.neby.exchange/dex',
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: 'factories',
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
}

export default adapter
