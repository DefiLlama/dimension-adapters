import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { uniV2Exports } from "../../helpers/uniswap";
// process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'
// TODO: disable TLS check only for this adapter, above line disables it for all adapters which is not ok
// export default univ2Adapter({
//   // [CHAIN.TOMOCHAIN]: "https://api.luaswap.org/subgraphs/name/phucngh/Luaswap3",
//   [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('DuiyRWD7SNu5rMGtM1MMP25VN57NcRGynCLJR7pah2E4')
// }, {});


const ETH_FACTORY = '0x0388C1E0f210AbAe597B7DE712B9510C6C36C857'
export default uniV2Exports({
  [CHAIN.ETHEREUM]: {
    factory: ETH_FACTORY,
  },
})