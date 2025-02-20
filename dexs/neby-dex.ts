import { univ2Adapter } from "../helpers/getUniSubgraphVolume";
import { CHAIN } from "../helpers/chains";

const endpoints = {
  [CHAIN.SAPPHIRE]: 'https://api.goldsky.com/api/public/project_clzi4lu67khgw01072ibvekvt/subgraphs/neby-dex-sapphire-mainnet/1.0.0/gn',
};
const adapter = univ2Adapter(endpoints, {
  factoriesName: 'factories',
});


export default adapter
