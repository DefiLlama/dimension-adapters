import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getSolanaReceived } from "../../helpers/token";

const chainConfig: any = {
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
	[CHAIN.MONAD]: { dune_chain: 'monad' },
	[CHAIN.ROBINHOOD]: { dune_chain: 'robinhood' },
}

// Dune chains read from dex_aggregator.trades; robinhood is not in it and is read from dex.trades below
const duneAggregatorChains = Object.values(chainConfig)
	.map((c: any) => c.dune_chain)
	.filter((c: string) => c !== 'solana' && c !== 'robinhood')
const duneChainList = [...duneAggregatorChains, 'robinhood'].map((c) => `'${c}'`).join(', ')

const prefetch = async (options: FetchOptions) => {
	const timeRange = (column: string) => `${column} >= FROM_UNIXTIME(${options.startTimestamp}) AND ${column} < FROM_UNIXTIME(${options.endTimestamp})`
	return await queryDuneSql(options, `
		WITH opensea_txs AS (
			SELECT DISTINCT blockchain, hash
			FROM evms.transactions
			WHERE blockchain IN (${duneChainList})
				AND ${timeRange('block_time')}
				AND varbinary_substring(data, varbinary_length(data) - 3, 4) = from_hex('865d8597')
		),
		aggregator_volume AS (
			SELECT
				blockchain,
				SUM(amount_usd) AS dailyVolume
			FROM dex_aggregator.trades
			WHERE blockchain IN (${duneAggregatorChains.map((c) => `'${c}'`).join(', ')})
				AND ${timeRange('block_time')}
				AND tx_hash IN (SELECT hash FROM opensea_txs)
			GROUP BY 1
		),
		robinhood_trades AS (
			SELECT
				t.tx_hash,
				t.token_bought_address,
				t.token_sold_address,
				t.amount_usd
			FROM dex.trades t
			INNER JOIN opensea_txs os ON t.tx_hash = os.hash AND os.blockchain = 'robinhood'
			WHERE t.blockchain = 'robinhood'
				AND ${timeRange('t.block_time')}
		),
		robinhood_volume AS (
			SELECT
				'robinhood' AS blockchain,
				SUM(t.amount_usd) AS dailyVolume
			FROM robinhood_trades t
			WHERE NOT EXISTS (
				SELECT 1
				FROM robinhood_trades prior_leg
				WHERE prior_leg.tx_hash = t.tx_hash
					AND prior_leg.token_bought_address = t.token_sold_address
			)
		)
		SELECT blockchain, dailyVolume FROM aggregator_volume
		UNION ALL
		SELECT blockchain, dailyVolume FROM robinhood_volume
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

const fetch = async (options: FetchOptions) => {
	if (options.chain === CHAIN.SOLANA) {
		return await fetchSolana(options)
	}
	const results = options.preFetchedResults || [];
	const chainData = results.find(
		(item: any) => chainConfig[options.chain].dune_chain === item.blockchain
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
	dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
	doublecounted: true
}

export default adapter;
