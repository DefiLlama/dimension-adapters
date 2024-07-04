import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
  "cronos": "https://graph.cronoslabs.com/subgraphs/name/vvs/exchange"
},{
  factoriesName: "vvsFactories",
  dayData: "vvsDayData",
});

adapter.adapter.cronos.start = 1632035122; // 1 a year ago

export default adapter
