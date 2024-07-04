import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.BOBA]: sdk.graph.modifyEndpoint('BicQZ5AsMXGPC1YZbm2SW3F2EqMA6zNSJiH6g338Hnrv')
}, {
});

adapters.adapter.boba.start = 1653525524;
export default adapters;
