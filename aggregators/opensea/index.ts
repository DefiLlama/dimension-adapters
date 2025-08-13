import { FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getSolanaReceived } from "../../helpers/token";

const chainConfig = {
	[CHAIN.ETHEREUM]: { dune_chain: 'ethereum' },
	// [CHAIN.ABSTRACT]: {dune_chain: 'abstract'},
	[CHAIN.APECHAIN]: { dune_chain: 'apechain' },
	[CHAIN.ARBITRUM]: { dune_chain: 'arbitrum' },
	[CHAIN.AVAX]: { dune_chain: 'avalanche_c' },
	[CHAIN.BLAST]: { dune_chain: 'blast' },
	[CHAIN.BASE]: { dune_chain: 'base' },
	[CHAIN.BERACHAIN]: { dune_chain: 'berachain' },
	// [CHAIN.FLOW]: {dune_chain: 'flow'},
	[CHAIN.OPTIMISM]: { dune_chain: 'optimism' },
	[CHAIN.POLYGON]: { dune_chain: 'polygon' },
	// [CHAIN.SEI]: {dune_chain: 'sei'},
	[CHAIN.UNICHAIN]: { dune_chain: 'unichain' },
	// [CHAIN.ZORA]: {dune_chain: 'zora'},
	[CHAIN.SOLANA]: { dune_chain: 'solana' },
}

const prefetch = async (options: FetchOptions) => {
	return await queryDuneSql(options, `
		SELECT 
			blockchain,
			SUM(amount_usd) as dailyVolume
		FROM dex_aggregator.trades
		WHERE tx_hash IN (
			SELECT hash FROM evms.transactions 
			WHERE
				block_time >= FROM_UNIXTIME(${options.startTimestamp})
				AND block_time <= FROM_UNIXTIME(${options.endTimestamp})
				AND varbinary_substring(data, varbinary_length(data) - 3, 4) = from_hex('865d8597')
		)
		GROUP BY 1
	`);
};

const fetchSolana = async (options: FetchOptions) => {
	const dailyFees = await getSolanaReceived({
		options,
		target: 'FEwxLZ64Wdh1VFP53jfA37yDVnD8gL3FgzsZNuQ6pCC9',
	})
	const dailyVolume = dailyFees.clone(100 / 0.85)

	return {
		dailyVolume,
	}
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	if (options.chain === CHAIN.SOLANA) {
		return await fetchSolana(options)
	}
	const results = options.preFetchedResults || [];
	const chainData = results.find(
		(item) => chainConfig[options.chain].dune_chain === item.blockchain
	);
	return {
		dailyVolume: chainData?.dailyVolume || 0,
	}
}

const adapter: SimpleAdapter = {
	version: 1,
	fetch,
	chains: Object.keys(chainConfig),
	prefetch,
	doublecounted: true
}

export default adapter;
