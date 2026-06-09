import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
	const startDate = options.dateString;
	const nextDay = new Date(options.startOfDay * 1000 + 86400000).toISOString().slice(0, 10);
	const url = `https://api.blockchair.com/dash/blocks?a=date,sum(fee_total)&q=time(${startDate}..${nextDay})`;
	const res = await fetchURL(url);
	if (!res.data || res.data.length === 0) throw new Error(`No Dash fee data found for ${startDate}`);
	const dayData = res.data.find((d: any) => d.date === startDate);
	if (!dayData) throw new Error(`No Dash fee data found for ${startDate}`);
	const feeDuffs = dayData["sum(fee_total)"];
	const feesDash = feeDuffs / 1e8;

	const dailyFees = options.createBalances();
	dailyFees.addCGToken("dash", feesDash);

	return { dailyFees, dailyRevenue: 0 };
};

const adapter: Adapter = {
	version: 1,
	fetch,
	chains: [CHAIN.DASH],
	start: '2014-01-19',
	protocolType: ProtocolType.CHAIN,
	methodology: {
		Fees: "Total transaction fees paid by users on the Dash network. Fees are split between miners and masternodes.",
	},
};

export default adapter;
