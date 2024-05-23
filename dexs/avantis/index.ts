import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { FetchResultVolume } from "../../adapters/types";

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

const fetchData = (_: Chain) => {
	return async (timestamp: number): Promise<FetchResultVolume> => {
		const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

		// Convert timestamp to Date object and format to YYYY-MM-DD in UTC
		const date = new Date(todaysTimestamp * 1000);
		const dateStr = date.toISOString().split("T")[0];

		// Find difference in days between today and the timestamp
		const today = new Date();
		const diffTime = Math.abs(today.getTime() - date.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		const url = `${API_URL}/history/analytics/daily-volumes/${diffDays}`;
		const value: IData = await fetchURL(url);
		if (!value.success) throw new Error("Failed to fetch data");

		const dailyVolume = value.history.find((d) => d.date === dateStr)?.volume;
		const totalVolume = value.history[value.history.length - 1]?.cumulativeVolume;
		return {
			dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
			totalVolume: totalVolume ? `${totalVolume}` : undefined,
			timestamp: todaysTimestamp,
		};
	};
};

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.BASE]: {
			fetch: fetchData(CHAIN.BASE),
			start: 1706313600,
		},
	},
};

export default adapter;
