import * as sdk from "@defillama/sdk";
import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('4b9bf8yyMfQBkjD94wmxFc4zf9ewhhQHhHfPqJrsSiq1'),
  [CHAIN.PULSECHAIN]: "https://api.algebra.finance/pulse-graph/subgraphs/name/cryptoalgebra/litx-analytics"
}, {
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.bsc.start = 1687305600;
adapters.adapter.pulse.start = 1686096000;
adapters.adapter.bsc.fetch = async (timestamp: number) => {return{timestamp, dailyVolume: 0}}
adapters.adapter.pulse.fetch = async (timestamp: number) => {return{timestamp, dailyVolume: 0}}
adapters.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;
export default adapters;
