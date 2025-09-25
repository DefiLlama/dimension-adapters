import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchL2FeesWithDune } from "../helpers/ethereum-l2";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	return await fetchL2FeesWithDune(options, 'zkevm');
}

const adapter: Adapter = {
	version: 1,
	adapter: {
		[CHAIN.POLYGON_ZKEVM]: {
			fetch,
			start: '2023-03-24',
		},
	},
	methodology: {
		Fees: 'Total transaction fees paid by users',
		Revenue: 'Total revenue on Polygon ZkEVM, calculated by subtracting the L1 Batch Costs from the total gas fees',
	},
	protocolType: ProtocolType.CHAIN,
	isExpensiveAdapter: true,
	allowNegativeValue: true, // L1 Costs
}

export default adapter;
