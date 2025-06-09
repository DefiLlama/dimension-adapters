import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch: any = async (options: FetchOptions) => {
	const dailyFees = await getSolanaReceived({
		options,
		target: "5KgfWjGePnbFgDAuCqxB5oymuFxQskvCtrw6eYfDa7fj",
	});
	return { dailyFees, dailyRevenue: dailyFees, protocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.SOLANA]: {
			fetch: fetch,
			meta: {
				methodology: {
					Fees: "All fees paid by users to use a particular Smithii tool.",
					Revenue: "All fees are collected by smithii.io protocol.",
					ProtocolRevenue:
						"Trading fees are collected by smithii.io protocol.",
				},
			},
		},
	},
	isExpensiveAdapter: true,
};

export default adapter;
