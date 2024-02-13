import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.SMARTBCH]: "https://thegraph.mistswap.fi/subgraphs/name/mistswap/exchange"
}, {
  factoriesName: "factories",
  totalVolume: "volumeUSD",
  dayData: "dayData",
  dailyVolume: "volumeUSD",
  dailyVolumeTimestampField: "date"
});

adapters.adapter.smartbch.start = 1633220803;
adapters.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;
export default adapters;
