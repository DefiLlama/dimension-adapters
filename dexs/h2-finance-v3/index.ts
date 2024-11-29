import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const adapter = univ2Adapter2({
  [CHAIN.CRONOS_ZKEVM]: "https://api.goldsky.com/api/public/project_clwrfupe2elf301wlhnd7bvva/subgraphs/h2-exchange-v3-cronos-zkevm/latest/gn"
},{
  factoriesName: "factories",
});

adapter.adapter[CHAIN.CRONOS_ZKEVM].start = 1;

export default adapter
