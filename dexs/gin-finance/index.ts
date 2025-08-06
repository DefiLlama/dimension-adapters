import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BOBA]: sdk.graph.modifyEndpoint('BicQZ5AsMXGPC1YZbm2SW3F2EqMA6zNSJiH6g338Hnrv')
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BOBA]: { fetch, start: 1653525524 },
  },
}

export default adapter;
