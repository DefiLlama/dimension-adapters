import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchL2FeesWithDune } from "../helpers/ethereum-l2";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	return await fetchL2FeesWithDune(options);
}

const adapter: Adapter = {
	version: 1,
	chains: [CHAIN.SCROLL],
	fetch,
	start: '2023-10-10',
	dependencies: [Dependencies.DUNE],
	protocolType: ProtocolType.CHAIN,
	methodology: {
		Fees: 'Transaction fees paid by users',
		Revenue: 'Total revenue on Scroll, calculated by subtracting the L1 Batch Costs from the total gas fees',
	},
	isExpensiveAdapter: true,
	allowNegativeValue: true, // L1 Costs
}

export default adapter;
