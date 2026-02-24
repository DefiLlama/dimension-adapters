import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter, FetchResultFees } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

interface IData {
	success: boolean;
	cumulativeFee: number;
	history: {
		date: string;
		totalFees: number;
		cumulativeFee: number;
		totalClosingFee: number;
		totalOpeningFee: number;
		totalRolloverFee: number;
	}[];
}

const API_URL = "https://api.avantisfi.com/v1";

const fetch =async (timestamp: number): Promise<FetchResultFees> => {
	const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

	// Convert timestamp to Date object and format to YYYY-MM-DD in UTC
	const date = new Date(todaysTimestamp * 1000);
	const dateStr = date.toISOString().split("T")[0];

	// Find difference in days between today and the timestamp
	const today = new Date();
	const diffTime = Math.abs(today.getTime() - date.getTime());
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	const url = `${API_URL}/history/analytics/total-fees/${diffDays}`;
	const value: IData = await fetchURL(url);
	if (!value.success) throw new Error("Failed to fetch data");

	const dailyFee = value.history.find((d) => d.date === dateStr)?.totalFees;

	return {
		dailyUserFees: dailyFee,
		dailyFees: dailyFee,
	};
};

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.BASE]: {
			fetch,
			start: '2024-01-27',
		},
	},
	version: 1
};

export default adapter;
