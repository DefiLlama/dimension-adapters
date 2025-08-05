import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";


const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.AVAX]: sdk.graph.modifyEndpoint('7TYvKnsZnaihZ1x5V8LgMRuvv7N8VuaM21GVRXPK6WR6')
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.AVAX]: { fetch, start: 1629251617 },
  },
}

export default adapter;