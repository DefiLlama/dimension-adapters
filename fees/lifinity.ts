import BigNumber from "bignumber.js";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import fetchURL from "../utils/fetchURL";

const historicalVolumeEndpoint = "https://api.lifinity.io/api/dashboard/volume"

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
  const dailyFees = historicalVolume
    .find(dayItem => dayItem.date === formattedDate)?.fees;

  const dailyFeesUsd = new BigNumber(dailyFees || 0);

  return {
    dailyFees: dailyFeesUsd.toString(),
    dailyRevenue: dailyFeesUsd.toString(),
    dailyProtocolRevenue: dailyFeesUsd.toString(),
    dailySupplySideRevenue: dailyFeesUsd.multipliedBy(0).toString(),
    dailyUserFees: dailyFeesUsd.toString(),
  };
};

const methodology = {
  UserFees: "Base trading fee differs on each pool",
  Fees: "All fees generated from trading fees",
  SupplySideRevenue: "LPs currently receive 0% of trading fees",
  ProtocolRevenue: "100% of trading fees is retained as a protocol fee",
  Revenue: "100% of trading fees is retained as a protocol fee",
  HoldersRevenue: "Holders have no revenue from trading fees",
}

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).volume.daily.data;
  return Number(new Date(historicalVolume[0].date.split('/').join('-')).getTime() / 1000)
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: getStartTimestamp,
    },
  },
  methodology,
  deadFrom:'2025-11-21',
}
export default adapter;
