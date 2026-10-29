import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { solanaVolumeQuery } from "./solana";

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
				t.blockchain,
				SUM(t.amount_usd) AS dailyVolume
			FROM dex_aggregator.trades t
			INNER JOIN opensea_txs os ON t.tx_hash = os.hash AND t.blockchain = os.blockchain
			WHERE t.blockchain IN (${duneAggregatorChains.map((c) => `'${c}'`).join(', ')})
				AND ${timeRange('t.block_time')}
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
	if (options.endTimestamp > Date.now() / 1000 - 10 * 60 * 60) {
		throw new Error('OpenSea Solana: allow 10 hours for Dune indexing');
	}
	const results = await queryDuneSql(options, solanaVolumeQuery(options), { extraUIDKey: 'solana-volume' });
	const row = results[0];
	if (!row || row.volume == null || row.decoded_legs == null || row.input_legs == null || row.unpriced_input_legs == null) {
		throw new Error('OpenSea Solana: missing Dune volume result');
	}
	if (Number(row.unpriced_input_legs) > 0 || (Number(row.decoded_legs) > 0 && Number(row.input_legs) === 0)) {
		throw new Error('OpenSea Solana: decoded swaps have missing input amounts or prices');
	}
	const dailyVolume = Number(row.volume);
	if (!Number.isFinite(dailyVolume) || dailyVolume < 0) {
		throw new Error('OpenSea Solana: invalid Dune volume');
	}
	return { dailyVolume };
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
	dependencies: [Dependencies.DUNE],
	methodology: {
		Volume: "On Solana, decoded swap input value for traders identified by a signed OpenSea memo or a transfer to the OpenSea fee wallet, counting each outer routing instruction's fresh input once; fee-free swaps without a memo and swaps Dune does not decode are excluded. On EVM, tagged transactions present in Dune's aggregator trades are counted, except Robinhood uses DEX trades with intermediate-token legs excluded; unlisted chains and tags only inside bundled calls are not covered.",
	},
	breakdownMethodology: {
		Volume: "Solana is valued at fresh route input using Dune's decoded trade prices, not fee receipts; EVM retains its existing aggregator and Robinhood DEX sources.",
	},
	doublecounted: true
}

export default adapter;
