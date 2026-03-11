import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
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

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
	const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
	const date = new Date(todaysTimestamp * 1000);
	const dateStr = date.toISOString().split("T")[0];

	const url = `${API_URL}/history/analytics/daily-volumes/60`;
	const value: IData = await fetchURL(url);
	if (!value.success) throw new Error("Failed to fetch data");

	const data = await fetchURL(`${API_URL}/cached/history/analytics/open-interest-snapshot/60`);
	const openInterest = data.history.find((d: any) => d.date === dateStr)?.openInterestSnapshot;
	const openInterestAtEnd = openInterest ? openInterest.totalRatio : 0;
	const dailyVolume = value.history.find((d) => d.date === dateStr)?.volume;

	return {
		dailyVolume,
		openInterestAtEnd
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
