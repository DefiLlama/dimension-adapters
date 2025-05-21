import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchL2FeesWithDune } from "../helpers/ethereum-l2";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	const { dailyFees, dailyRevenue } = await fetchL2FeesWithDune(options);
	return {
		dailyFees
	}
}

const adapter: Adapter = {
	version: 1,
	adapter: {
		[CHAIN.SCROLL]: {
			fetch,
			start: '2023-10-10'
		},
	},
	protocolType: ProtocolType.CHAIN,
	isExpensiveAdapter: true,
	allowNegativeValue: true, // L1 Costs
}

export default adapter;
