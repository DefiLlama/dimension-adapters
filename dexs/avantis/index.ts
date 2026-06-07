import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { FetchResultVolume } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

interface IData {
	success: boolean;
	cumulativeVolume: number;
	history: {
		date: string;
		volume: number;
		buyVolume: number;
		sellVolume: number;
		cumulativeVolume: number;
	}[];
}

const API_URL = "https://api.avantisfi.com/v1";

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
	const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);
	const date = new Date(todaysTimestamp * 1000);
	const dateStr = date.toISOString().split("T")[0];

  const url = `${API_URL}/cached/history/analytics/daily-volumes/60`;
  const value: IData = await fetchURL(url);
	if (!value.success) throw new Error("Failed to fetch data");

	const data = await fetchURL(`${API_URL}/cached/history/analytics/open-interest-snapshot/60`);
	const openInterest = data.history.find((d: any) => d.date === dateStr)?.openInterestSnapshot;
	const dailyVolume = value.history.find((d) => d.date === dateStr)?.volume;

	return {
		dailyVolume,
		openInterestAtEnd: openInterest ? openInterest.totalRatio : 0,
		longOpenInterestAtEnd: openInterest ? openInterest.longTotal : 0,
		shortOpenInterestAtEnd: openInterest ? openInterest.shortTotal : 0,
	};
};

const adapter: SimpleAdapter = {
	version: 1,
	adapter: {
		[CHAIN.BASE]: {
			fetch,
			start: '2024-01-27',
		},
	},
};

export default adapter;
