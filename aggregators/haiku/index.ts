import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { HaikuAddreses } from "../../helpers/aggregators/haiku";
import { queryDuneSql } from "../../helpers/dune";

interface IResponse {
	chain: string;
	volume: number;
}

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions) => {
	const chains = Object.keys(HaikuAddreses);
	const unionQueries = chains.map(chain => {
		const blockchainName = chain.toLowerCase() === 'bsc' ? 'bnb' : chain.toLowerCase();
		return `
		SELECT 
			'${chain.toLowerCase()}' as chain,
			GREATEST(
				SUM(CASE WHEN tx."from" = tokenstf."from" THEN tokenstf.amount * price.price ELSE 0 END),
				SUM(CASE WHEN tx."from" = tokenstf."to" THEN tokenstf.amount * price.price ELSE 0 END)
			) AS tx_volume
		FROM ${blockchainName}.transactions tx
		LEFT JOIN tokens.transfers tokenstf
			ON tx.hash = tokenstf.tx_hash
			AND tokenstf.blockchain = '${blockchainName}'
			AND tokenstf.block_time >= from_unixtime(${options.startTimestamp})
			AND tokenstf.block_time < from_unixtime(${options.endTimestamp})
		LEFT JOIN prices.minute price
			ON price.blockchain = '${blockchainName}'
			AND price.contract_address = tokenstf.contract_address
			AND price.timestamp = date_add(
				'minute',
				CAST(floor(minute(tx.block_time) / 15) * 15 AS integer),
				date_trunc('hour', tx.block_time)
			)
			AND price.timestamp >= from_unixtime(${options.startTimestamp})
			AND price.timestamp < from_unixtime(${options.endTimestamp})
		WHERE tx.to = 0x24aC999FF132B32c5b3956973b6213B0d07eB2C7
			AND CAST(tx.data AS varchar) LIKE '0xa1de4537%'
			AND tx.block_time >= from_unixtime(${options.startTimestamp})
			AND tx.block_time < from_unixtime(${options.endTimestamp})
			AND (
				tx."from" = tokenstf."from" OR tx."from" = tokenstf."to"
			)
		GROUP BY tx.hash
	`;
	}).join(' UNION ALL ');

	const sql_query = `
		WITH tx_volumes AS (
			${unionQueries}
		)
		SELECT 
			chain,
			SUM(tx_volume) AS volume
		FROM tx_volumes
		GROUP BY chain
	`;
	console.log(sql_query);
	return queryDuneSql(options, sql_query);
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	const results: IResponse[] = options.preFetchedResults || [];
	const chainData = results.find(item => item.chain === options.chain.toLowerCase());
	console.log(options.chain, chainData);

	return {
		dailyVolume: chainData?.volume || 0,
	};
};

const adapter: SimpleAdapter = {
	version: 1,
	adapter: Object.keys(HaikuAddreses).reduce((acc, chain) => {
		return {
			...acc,
			[chain]: {
				fetch,
				start: HaikuAddreses[chain].startTime,
			},
		};
	}, {}),
	prefetch: prefetch,
	isExpensiveAdapter: true,
};

export default adapter;
