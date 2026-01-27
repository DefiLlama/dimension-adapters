import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchL2FeesWithDune } from "../helpers/ethereum-l2";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	return await fetchL2FeesWithDune(options);
}

const adapter: Adapter = {
	version: 1,
	fetch,
	chains: [CHAIN.BOBA],
	start: '2021-08-13',
	dependencies: [Dependencies.DUNE],
	protocolType: ProtocolType.CHAIN,
	isExpensiveAdapter: true,
	allowNegativeValue: true, // L1 Costs
}

export default adapter;
