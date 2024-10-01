import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter2({
  "cronos": "https://graph.cronoslabs.com/subgraphs/name/vvs/exchange"
},{
  factoriesName: "vvsFactories",
});

adapter.adapter.cronos.start = 1632035122; // 1 a year ago

export default adapter
