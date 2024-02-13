import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../../adapters/types";
import { ETHEREUM } from "../../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC, getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getOneDayFees } from "../../helpers/getChainFees";
import fetchURL from "../../utils/fetchURL";
import { getPrices } from "../../utils/prices";
import BigNumber from "bignumber.js";

const burnEndpoint = "https://www.theblock.co/api/charts/chart/on-chain-metrics/ethereum/burned-eth-after-eip-1559-daily"

interface IChartItem {
  Timestamp: number
  Result: number
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)
  const today = new Date(todaysTimestamp * 1000).toISOString()
  const yesterday = new Date(yesterdaysTimestamp * 1000).toISOString()

  const dailyFees = await getOneDayFees('eth', yesterday, today);
  const burnData: IChartItem[] = (await fetchURL(burnEndpoint)).chart.jsonFile.Series['ETH Burned']['Data']

  const dailyRevEth = burnData
    .filter(item => item.Timestamp === yesterdaysTimestamp)
    .find(item => item)?.Result || 0


  const dailyRev = createBalances()
  dailyRev.addGasToken(dailyRevEth * 10 ** 18)

  return {
    timestamp,
    dailyFees,
    dailyRevenue: dailyRev,
    dailyHoldersRevenue: dailyRev,
  };
};

const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch,
      start: 1438228800,
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
