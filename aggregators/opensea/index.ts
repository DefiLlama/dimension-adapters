import { FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const chainConfig = {
	[CHAIN.ETHEREUM]: {start: 1720000000, dune_chain: 'ethereum'},
	// [CHAIN.ABSTRACT]: {start: 1720000000, dune_chain: 'abstract'},
	[CHAIN.APECHAIN]: {start: 1720000000, dune_chain: 'apechain'},
	[CHAIN.ARBITRUM]: {start: 1720000000, dune_chain: 'arbitrum'},
	[CHAIN.AVAX]: {start: 1720000000, dune_chain: 'avalanche_c'},
	[CHAIN.BLAST]: {start: 1720000000, dune_chain: 'blast'},
	[CHAIN.BASE]: {start: 1720000000, dune_chain: 'base'},
	[CHAIN.BERACHAIN]: {start: 1720000000, dune_chain: 'berachain'},
	// [CHAIN.FLOW]: {start: 1720000000, dune_chain: 'flow'},
	[CHAIN.OPTIMISM]: {start: 1720000000, dune_chain: 'optimism'},
	[CHAIN.POLYGON]: {start: 1720000000, dune_chain: 'polygon'},
	// [CHAIN.SEI]: {start: 1720000000, dune_chain: 'sei'},
	[CHAIN.UNICHAIN]: {start: 1720000000, dune_chain: 'unichain'},
	// [CHAIN.ZORA]: {start: 1720000000, dune_chain: 'zora'},
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

const fetch = async (_a:any, _b:any, options: FetchOptions) => {
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
