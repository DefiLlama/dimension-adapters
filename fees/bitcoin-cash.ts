import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(CHAIN.BITCOIN_CASH, "bch", 1501588800);

const adapter: Adapter = {
	version: 1,
	adapter: {
		[CHAIN.BITCOIN_CASH]: {
			fetch: async (options: FetchOptions) => {
				const baseData = await feeAdapter[CHAIN.BITCOIN_CASH].fetch(options);
				const dailyFees = options.createBalances();
				dailyFees.addCGToken("bitcoin-cash", baseData.dailyFees);
				return { dailyFees, dailyRevenue: 0 };
			},
			start: '2017-08-01',
		},
	},
	protocolType: ProtocolType.CHAIN,
};

export default adapter;
