import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { Adapter } from "../../adapters/types";
// import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
// process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'
// TODO: disable TLS check only for this adapter, above line disables it for all adapters which is not ok

// export default univ2Adapter({
//   // [CHAIN.TOMOCHAIN]: "https://api.luaswap.org/subgraphs/name/phucngh/Luaswap3",
//   [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('DuiyRWD7SNu5rMGtM1MMP25VN57NcRGynCLJR7pah2E4')
// }, {});

const adapter: Adapter = {
  deadFrom: "2024-03-31",
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: async () => {
        return {
          dailyVolume: 0
        };
      },  
      start: '2022-03-24',
    },
  },
};

export default adapter;
