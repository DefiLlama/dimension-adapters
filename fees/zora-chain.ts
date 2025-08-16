import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchL2FeesWithDune } from "../helpers/ethereum-l2";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	return await fetchL2FeesWithDune(options);
}

const adapter: Adapter = {
	version: 1,
	adapter: {
		[CHAIN.ZORA]: {
			fetch,
			start: '2023-06-13',
		},
	},
	protocolType: ProtocolType.CHAIN,
	isExpensiveAdapter: true,
	allowNegativeValue: true, // L1 Costs
	methodology: {
		Fees: 'Transaction fees paid by users',
		Revenue: 'Total revenue on Zora, calculated by subtracting the L1 Batch Costs from the total gas fees',
	}
}

export default adapter;
