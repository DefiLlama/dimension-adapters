import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  // [CHAIN.MOONRIVER]: 'https://api.thegraph.com/subgraphs/name/toadguy/padswap-subgraph-moonriver',
  [CHAIN.BSC]: 'https://api.thegraph.com/subgraphs/name/d1stsys/padswap-backup-2',
  [CHAIN.MOONBEAN]: 'https://api.thegraph.com/subgraphs/name/toadguy/padswap-subgraph-moonbeam',
}, {});

adapters.adapter.bsc.start = 1620518400;
// adapters.adapter.moonriver.start = 1635638400;
adapters.adapter.moonbeam.start = 1642032000;
export default adapters;
