import { FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const chainConfig = {
	[CHAIN.ETHEREUM]: {dune_chain: 'ethereum'},
	// [CHAIN.ABSTRACT]: {dune_chain: 'abstract'},
	[CHAIN.APECHAIN]: {dune_chain: 'apechain'},
	[CHAIN.ARBITRUM]: {dune_chain: 'arbitrum'},
	[CHAIN.AVAX]: {dune_chain: 'avalanche_c'},
	[CHAIN.BLAST]: {dune_chain: 'blast'},
	[CHAIN.BASE]: {dune_chain: 'base'},
	[CHAIN.BERACHAIN]: {dune_chain: 'berachain'},
	// [CHAIN.FLOW]: {dune_chain: 'flow'},
	[CHAIN.OPTIMISM]: {dune_chain: 'optimism'},
	[CHAIN.POLYGON]: {dune_chain: 'polygon'},
	// [CHAIN.SEI]: {dune_chain: 'sei'},
	[CHAIN.UNICHAIN]: {dune_chain: 'unichain'},
	// [CHAIN.ZORA]: {dune_chain: 'zora'},
}

const prefetch = async (options: FetchOptions) => {
	return await queryDuneSql(options, `
        select
			blockchain,
			SUM(amount_usd) as dailyBridgeVolume
        from tokens.transfers
        where tx_hash in (
			SELECT hash FROM evms.transactions
            where varbinary_substring (data, varbinary_length (data) - 3, 4) = from_hex('865d8597')
				AND block_time >= FROM_UNIXTIME(${options.startTimestamp})
				AND block_time <= FROM_UNIXTIME(${options.endTimestamp})
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
		dailyBridgeVolume: chainData?.dailyBridgeVolume || 0,
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
