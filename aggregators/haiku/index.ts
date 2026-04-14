
import {
  HaikuChainConfig,
  mappingChainToDuneChain,
} from "../../helpers/aggregators/haiku";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { formatAddress } from "../../utils/utils";

interface IResponse {
  chain: string;
  token: string;
  amount: string;
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
			SELECT '${chain.toLowerCase()}' as chain, tokenstf.contract_address as token, SUM(tokenstf.amount_raw) as amount
			FROM ${blockchainName}.logs log
			INNER JOIN ${blockchainName}.transactions tx
				ON log.tx_hash = tx.hash
				AND tx.block_date >= from_unixtime(${options.startTimestamp})
				AND tx.block_date < from_unixtime(${options.endTimestamp})
			INNER JOIN tokens.transfers tokenstf
				ON tokenstf.tx_hash = log.tx_hash
				AND tokenstf.blockchain = '${blockchainName}'
				AND tokenstf.block_date >= from_unixtime(${options.startTimestamp})
				AND tokenstf.block_date < from_unixtime(${options.endTimestamp})
				AND (
					tx."from" = tokenstf."from" OR tx."from" = tokenstf."to"
				)
			WHERE log.contract_address = ${HaikuChainConfig[chain].id.toLowerCase()}
				AND log.topic0 = 0x8b3a3eb535e3217f5718db4d1c134d3447f392bcb89955537208f4677860e213
				AND log.block_date >= from_unixtime(${options.startTimestamp})
				AND log.block_date < from_unixtime(${options.endTimestamp})
			GROUP BY tokenstf.contract_address
			HAVING SUM(tokenstf.amount_raw) IS NOT NULL
		`;
			})
			.join(" UNION ALL ");
		
		results = results.concat(await queryDuneSql(options, unionQueries));
	}

  return results;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	const dailyVolume = options.createBalances()
  	const results: IResponse[] = options.preFetchedResults || [];
  	const chainData = results.filter(
		(item) => item.chain === options.chain.toLowerCase()
	);
	const blacklistTokens = getDefaultDexTokensBlacklisted(options.chain);
	chainData.forEach(row => {
		if (row.token && row.amount && !blacklistTokens.includes(formatAddress(row.token))) {
		dailyVolume.add(row.token, row.amount);
		}
	});

	return {
		dailyVolume
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
