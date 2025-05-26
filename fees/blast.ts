import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchL2FeesWithDune } from "../helpers/ethereum-l2";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	return await fetchL2FeesWithDune(options);
}

const adapter: Adapter = {
	version: 1,
	adapter: {
		[CHAIN.BLAST]: {
			fetch,
			start: '2024-02-24'
		},
	},
	protocolType: ProtocolType.CHAIN,
	isExpensiveAdapter: true,
	allowNegativeValue: true, // L1 Costs
}

export default adapter;
