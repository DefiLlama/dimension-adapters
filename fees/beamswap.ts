
import { Adapter, ChainEndpoints } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getStartTimestamp } from "../helpers/getStartTimestamp";
import { getDexChainFees } from "../helpers/getUniSubgraphFees";
import { univ2Adapter } from "../helpers/getUniSubgraphVolume";

const TOTAL_FEES = 0.0030;
const PROTOCOL_FEES = 0.0013;

const endpoints: ChainEndpoints = {
  [CHAIN.MOONBEAN]:
    "https://api.thegraph.com/subgraphs/name/beamswap/beamswap-dex-v2",
};


const volumeAdapter = univ2Adapter({
  [CHAIN.MOONBEAN]: "https://api.thegraph.com/subgraphs/name/beamswap/beamswap-dex-v2",
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
  adapter: feeAdapter
};


export default adapter;
