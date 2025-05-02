import { univ2Adapter } from "../helpers/getUniSubgraphVolume";
import { CHAIN } from "../helpers/chains";

const endpoints = {
  [CHAIN.SAPPHIRE]: 'https://graph.api.neby.exchange/dex',
};
const adapter = univ2Adapter(endpoints, {
  factoriesName: 'factories',
});


export default adapter
