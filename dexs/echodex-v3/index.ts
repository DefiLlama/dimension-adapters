import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/echodex/exchange-v3"
}, {
  factoriesName: "factories",
  dayData: "echodexDayData",
  dailyVolume: "volumeUSD"
});


adapters.adapter.linea.start = 1691107200;
export default adapters;
