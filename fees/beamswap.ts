import * as sdk from "@defillama/sdk";

import { Adapter, ChainEndpoints } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getStartTimestamp } from "../helpers/getStartTimestamp";
import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import { univ2Adapter } from "../helpers/getUniSubgraphVolume";

const TOTAL_FEES = 0.0030;
const PROTOCOL_FEES = 0.0013;

const endpoints: ChainEndpoints = {
  [CHAIN.MOONBEAN]:
    sdk.graph.modifyEndpoint('9CwTvN5R8sztZSBZqbDZWcHZjM41RRiz63QmRMsJBn6X'),
};


const volumeAdapter = univ2Adapter({
  [CHAIN.MOONBEAN]: sdk.graph.modifyEndpoint('9CwTvN5R8sztZSBZqbDZWcHZjM41RRiz63QmRMsJBn6X'),
}, {});

volumeAdapter.adapter.moonbeam.start = getStartTimestamp({
  endpoints,
  chain: CHAIN.MOONBEAN,
  dailyDataField: "uniswapDayDatas",
  dateField: "date",
  volumeField: "dailyVolumeUSD",
})

const feeAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: Adapter = {
  version: 1,
  adapter: feeAdapter
};


export default adapter;
