import BigNumber from "bignumber.js";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import fetchURL from "../utils/fetchURL";

const historicalVolumeEndpoint = "https://lifinity.io/api/dashboard/volume"

interface IVolumeall {
  fees: number;
  date: string;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const dateStr = new Date(dayTimestamp * 1000).toLocaleDateString('en-US', { timeZone: 'UTC' })
  const [month, day, year] = dateStr.split('/');
  const formattedDate = `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).volume.daily.data;
  const totalFees = historicalVolume
    .filter(volItem => Number(new Date(volItem.date.split('/').join('-')).getTime() / 1000) <= dayTimestamp)
    .reduce((acc, { fees }) => acc + Number(fees), 0);

  const dailyFees = historicalVolume
    .find(dayItem => dayItem.date === formattedDate)?.fees;
  const fetchResponse: FetchResultFees = {
    timestamp: dayTimestamp
  }
  if (dailyFees !== undefined) {
    const dailyFeesUsd = new BigNumber(dailyFees);
    fetchResponse['dailyFees'] = dailyFeesUsd.toString()
    fetchResponse['dailyRevenue'] = dailyFeesUsd.multipliedBy(0.15).toString()
    fetchResponse['dailyProtocolRevenue'] = dailyFeesUsd.multipliedBy(0.15).toString()
    fetchResponse['dailySupplySideRevenue'] = dailyFeesUsd.multipliedBy(0.85).toString()
    fetchResponse['dailyUserFees'] = dailyFeesUsd.toString()
  }

  if (totalFees !== undefined) {
    const totalFeesUsd = new BigNumber(totalFees);
    fetchResponse['totalFees'] = totalFeesUsd.toString()
    fetchResponse['totalRevenue'] = totalFeesUsd.multipliedBy(0.15).toString()
    fetchResponse['totalProtocolRevenue'] = totalFeesUsd.multipliedBy(0.15).toString()
    fetchResponse['totalSupplySideRevenue'] = totalFeesUsd.multipliedBy(0.85).toString()
    fetchResponse['totalUserFees'] = totalFeesUsd.toString()
  }

  return fetchResponse;
};

const methodology = {
  UserFees: "Base trading fee differs on each pool",
  Fees: "All fees generated from trading fees",
  SupplySideRevenue: "LPs currently receive 85% of trading fees",
  ProtocolRevenue: "A 15% of trading fees is retained as a protocol fee",
  Revenue: "A 15% of trading fees is retained as a protocol fee",
  HoldersRevenue: "Holders have no revenue from trading fees",
}

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).volume.daily.data;
  return Number(new Date(historicalVolume[0].date.split('/').join('-')).getTime() / 1000)
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: getStartTimestamp,
      meta: {
        methodology
      }
    },
  }
}
export default adapter;
