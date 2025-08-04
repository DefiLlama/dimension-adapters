import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchL2FeesWithDune } from "../../helpers/ethereum-l2";

const ethereumWallets = [
	'0xfeeE860e7AAE671124e9a4E61139f3A5085dFEEE',
	'0xA9232040BF0E0aEA2578a5B2243F2916DBfc0A69'
]

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	return await fetchL2FeesWithDune(options, 'zksync');
}

const adapter: Adapter = {
	version: 1,
	adapter: {
		[CHAIN.ERA]: {
			fetch,
			start: '2023-02-14', // February 14, 2023
		},
	},
	protocolType: ProtocolType.CHAIN,
	isExpensiveAdapter: true,
	allowNegativeValue: true, // L1 Costs
}

export default adapter;
