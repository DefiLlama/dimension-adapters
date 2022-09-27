import { FeeAdapter } from "../utils/adapters.type";
import { ETHEREUM } from "../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC, getTimestampAtStartOfDayUTC } from "../utils/date";
import { getOneDayFees } from "../helpers/getChainFees";
import { fetchURL } from "@defillama/adapters/projects/helper/utils";
import axios from "axios";
import { getPrices } from "../utils/prices";
import BigNumber from "bignumber.js";

const burnEndpoint = "https://www.theblock.co/api/charts/chart/on-chain-metrics/ethereum/burned-eth-after-eip-1559-daily"

interface IChartItem {
  Timestamp: number
  Result: number
}

const graphs = () => {
  return () => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)
      const today = new Date(todaysTimestamp * 1000).toISOString()
      const yesterday = new Date(yesterdaysTimestamp * 1000).toISOString()

      const dailyFee = await getOneDayFees('eth', yesterday, today);
      const burnData: IChartItem[] = (await fetchURL(burnEndpoint))?.data.chart.jsonFile.Series['ETH Burned']['Data']

      const dailyRevEth = burnData
        .filter(item => item.Timestamp === yesterdaysTimestamp)
        .find(item => item)?.Result || 0

      const ethAddress = "ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
      const pricesObj: any = await getPrices([ethAddress], todaysTimestamp);
      const latestPrice = new BigNumber(pricesObj[ethAddress]["price"])

      const dailyRev = latestPrice.multipliedBy(new BigNumber(dailyRevEth))
      
      return {
        timestamp,
        totalFees: "0",
        dailyFees: dailyFee.toString(),
        totalRevenue: "0",
        dailyRevenue: dailyRev.toString(),
      };
    };
  };
};

const adapter: FeeAdapter = {
  fees: {
    [ETHEREUM]: {
        fetch: graphs()(),
        start: 1438228800,
    },
  },
  adapterType: "chain"
}

export default adapter;
