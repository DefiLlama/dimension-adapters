
import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
  [CHAIN.CRONOS]: "https://gnode.photonswap.finance/subgraphs/name/dexbruce/photonswap"
}, {});

adapter.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter
adapter.adapter[CHAIN.CRONOS].start = 1690070400
adapter.adapter[CHAIN.CRONOS].fetch = async (timestamp: number) => {
  return {
    dailyVolume: 0,
    timestamp,
  }
}

export default adapter
