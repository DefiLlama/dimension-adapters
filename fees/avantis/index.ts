import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter, FetchResultFees, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

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

const methodology = {
	Fees: "Avantis collects fees from perpetual trading activities including position opening fees, position closing fees, and rollover fees for maintaining open positions",
	UserFees: "All fees are paid directly by traders",
	SupplySideRevenue: "All fees are distributed to LPs",
	Revenue: "No revenue for now",
};

const breakdownMethodology = {
	Fees: {
		[METRIC.TRADING_FEES]: "Fees charged when traders open/close perpetual positions + rollover fees for maintaining open positions",
	},
	SupplySideRevenue: {
		'Trading Fees To LPs': "All trading fees are distributed to LPs.",
	},
};

const fetch =async (_a: number, _b:any, options: FetchOptions): Promise<FetchResultFees> => {

	const date = new Date(options.startOfDay * 1000);
	const dateStr = date.toISOString().split("T")[0];

	// Find difference in days between today and the timestamp
	const today = new Date();
	const diffTime = Math.abs(today.getTime() - date.getTime());
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	const url = `${API_URL}/history/analytics/total-fees/${diffDays}`;
	const value: IData = await fetchURL(url);
	if (!value.success) throw new Error("Failed to fetch data");

  const df = value.history.find((d) => d.date === dateStr)?.totalFees;
	
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  
	dailyFees.addUSDValue(df, METRIC.TRADING_FEES);
	dailySupplySideRevenue.addUSDValue(df, 'Trading Fees To LPs');

	return {
		dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
		dailySupplySideRevenue,
	};
};

const adapter: SimpleAdapter = {
	version: 1,
	fetch,
	chains: [CHAIN.BASE],
	start: '2024-01-27',
	methodology,
	breakdownMethodology,
};

export default adapter;
