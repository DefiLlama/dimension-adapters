import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

const llamaChainToDuneChain = {
	[CHAIN.ETHEREUM]: 'ethereum',
	[CHAIN.AVAX]: 'avalanche_c',
	[CHAIN.SOLANA]: 'solana',
}

const prefetch = async (options: FetchOptions) => {
	const query = await getSqlFromFile('helpers/queries/secondswap.sql', {
		start: options.startTimestamp,
		end: options.endTimestamp,
	});
	return await queryDuneSql(options, query);
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	const duneChain = llamaChainToDuneChain[options.chain];
	const prefetchData = options.preFetchedResults;
	const chainData = prefetchData?.find((item: any) => item.chain === duneChain);

	if (!chainData || chainData.usd_volume === null) {
		return { dailyVolume: 0, dailyFees: 0 }
	}

	return {
		dailyVolume: chainData.usd_volume,
		dailyFees: chainData.usd_fee,
	}
};

const methodology = {
	Fees: "Trading fees paid by buyers and sellers on each spot purchase transaction.",
};

const adapter: SimpleAdapter = {
	fetch,
	prefetch,
	dependencies: [Dependencies.DUNE],
	adapter: {
		[CHAIN.ETHEREUM]: { start: '2025-02-27' },
		[CHAIN.AVAX]: { start: '2025-09-16' },
		// [CHAIN.SOLANA]: { start: '2024-12-01' },
	},
	isExpensiveAdapter: true,
	methodology,
};

export default adapter
