
import {
  HaikuChainConfig,
  mappingChainToDuneChain,
} from "../../helpers/aggregators/haiku";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

interface IResponse {
  chain: string;
  volume: number;
}

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions): Promise<any> => {
	let results: Array<IResponse> = [];

	// split query
	const chainGroups: Array<Array<string>> = [
		Object.keys(HaikuChainConfig).slice(0 ,4),
		Object.keys(HaikuChainConfig).slice(4 ,8),
		Object.keys(HaikuChainConfig).slice(8 ,12),
		Object.keys(HaikuChainConfig).slice(12, -1)
	];

	for (const chains of chainGroups) {
		const unionQueries = chains
			.map((chain) => {
				const blockchainName = mappingChainToDuneChain(chain);
				return `
			SELECT
				'${chain.toLowerCase()}' as chain,
				SUM(
					GREATEST(
						CASE
							WHEN tx."from" = tokenstf."from" THEN tokenstf.amount * price.price
							ELSE 0
						END,
						CASE
							WHEN tx."from" = tokenstf."to" THEN tokenstf.amount * price.price
							ELSE 0
						END
					)
				) AS volume
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
			WHERE tx.hash IN (select tx_hash from ${blockchainName}.logs log WHERE log.contract_address = 0x24ac999ff132b32c5b3956973b6213b0d07eb2c7 and log.topic0 = 0x8b3a3eb535e3217f5718db4d1c134d3447f392bcb89955537208f4677860e213)
				AND tx.block_time >= from_unixtime(${options.startTimestamp})
				AND tx.block_time < from_unixtime(${options.endTimestamp})
				AND (
					tx."from" = tokenstf."from" OR tx."from" = tokenstf."to"
				)
		`;
			})
			.join(" UNION ALL ");
		
		results = results.concat(await queryDuneSql(options, unionQueries));
	}

  return results;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const results: IResponse[] = options.preFetchedResults || [];
  const chainData = results.find(
    (item) => item.chain === options.chain.toLowerCase()
  );

  return {
    dailyVolume: chainData?.volume || 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
	fetch,
  prefetch: prefetch,
  chains: Object.keys(HaikuChainConfig),
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
};

export default adapter;
