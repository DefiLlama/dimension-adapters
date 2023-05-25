
import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
  [CHAIN.CRONOS]: "https://gnode.photonswap.finance/subgraphs/name/dexbruce/photonswap"
}, {});

adapter.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter

export default adapter