import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryAllium } from '../../helpers/allium';
import { addOneToken } from '../../helpers/prices';

const SWAP_EVENTS = [
	'0xe8f996ea6ff38c557c253d3b93cfe2ebf393816487266786371aa4532a9229f2::settle::Swap',
	'0x7ea6e27ad7af6f3b8671d59df1aaebd7c03dddab893e52a714227b2f4fe91519::settle::Swap',
];

const MAX_INGESTION_GAP_SECONDS = 300;

const SUI_FRAMEWORK = '0'.repeat(63) + '2';
const toCoinType = (coin: string) => (coin.startsWith(`${SUI_FRAMEWORK}::`) ? '0x2' + coin.slice(64) : '0x' + coin);

const fetch = async (options: FetchOptions) => {
	const dailyVolume = options.createBalances();

	const rows = await queryAllium(`
		WITH ingested AS (
			SELECT DATE_PART(epoch_second, MAX(checkpoint_timestamp)) AS last_event
			FROM sui.raw.events
			WHERE checkpoint_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
				AND checkpoint_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
		), swaps AS (
			-- coin_in/coin_out are TypeName structs: older Allium rows keep them as {"name": ...}, newer ones as the plain string
			SELECT
				COALESCE(parsed_json:coin_in:name::string, parsed_json:coin_in::string) AS coin_in,
				COALESCE(parsed_json:coin_out:name::string, parsed_json:coin_out::string) AS coin_out,
				TO_VARCHAR(SUM(parsed_json:amount_in::number)) AS amount_in,
				TO_VARCHAR(SUM(parsed_json:amount_out::number)) AS amount_out
			FROM sui.raw.events
			WHERE checkpoint_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
				AND checkpoint_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
				AND type IN (${SWAP_EVENTS.map((t) => `'${t}'`).join(', ')})
			GROUP BY 1, 2
		)
		SELECT ingested.last_event, swaps.*
		FROM ingested LEFT JOIN swaps ON TRUE
	`);

	const lastEvent = Number(rows[0]?.last_event);
	if (!lastEvent || lastEvent < options.endTimestamp - MAX_INGESTION_GAP_SECONDS)
		throw new Error(`bluefin7k: Allium sui.raw.events is incomplete for ${options.startTimestamp}-${options.endTimestamp} (last event ${rows[0]?.last_event})`);

	for (const row of rows) {
		if (!row.coin_in) continue;
		addOneToken({
			balances: dailyVolume,
			token0: toCoinType(row.coin_in),
			amount0: row.amount_in,
			token1: toCoinType(row.coin_out),
			amount1: row.amount_out,
		});
	}

	return { dailyVolume };
};

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	dependencies: [Dependencies.ALLIUM],
	isExpensiveAdapter: true,
	fetch,
	chains: [CHAIN.SUI],
	start: '2025-06-03',
	methodology: {
		Volume: 'Value of swaps routed through the Bluefin7K aggregator on Sui, read from the settle Swap event its router emits for every swap. Each swap is counted once, on its major coin (SUI, USDC, ...) where it has one.',
	},
};

export default adapter;
