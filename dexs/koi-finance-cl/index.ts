import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
    [CHAIN.ERA]: "https://api.studio.thegraph.com/query/12332/koi-finance-v3/version/latest",
  };

const adapter = univ2Adapter2(endpoints, {
  factoriesName: "factories",
  dayData: "koiFinanceDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapter.adapter.era.start = 1679529600

export default adapter
