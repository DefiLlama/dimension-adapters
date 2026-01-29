import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

// Chain-specific configurations for transfers and token decimals
const getChainQueryConfig = (
	duneChain: string,
): {
	filteredTransfers: (fromTimestamp: number, toTimestamp: number) => string;
	tokenDecimals: string;
	defaultDecimals: number;
} => {
	const ecosystem = duneChain === 'solana' ? 'solana' : 'evm';

	const ecosystemConfig = {
		solana: {
			filteredTransfers: (fromTimestamp: number, toTimestamp: number): string => `
				SELECT
						t.token_mint_address AS contract_address,
						t.amount AS value,
						t.tx_id AS evt_tx_hash,
						DATE(t.block_time) AS evt_block_date,
						t.to_owner AS "to"
				FROM tokens_solana.transfers t
				INNER JOIN mp_txs m ON t.tx_id = m.evt_tx_hash
				WHERE t.block_time >= from_unixtime(${fromTimestamp})
				AND t.block_time <= from_unixtime(${toTimestamp})
				AND t.to_owner IS NOT NULL
			`,
			tokenDecimals: `
				SELECT token_mint_address AS contract_address, decimals
				FROM tokens_solana.fungible
				WHERE token_mint_address IN (SELECT contract_address FROM raw_tvl)
			`,
			defaultDecimals: 9,
		},
		evm: {
			filteredTransfers: (fromTimestamp: number, toTimestamp: number) => `
				SELECT
						contract_address,
						value,
						evt_tx_hash,
						evt_block_date,
						"to"
				FROM erc20_${duneChain}.evt_Transfer
				WHERE from_unixtime(${fromTimestamp}) <= evt_block_time
				AND from_unixtime(${toTimestamp}) >= evt_block_time 
				AND evt_tx_hash IN (SELECT evt_tx_hash FROM mp_txs)`,
			tokenDecimals: `
				SELECT contract_address, decimals
				FROM tokens.erc20
				WHERE contract_address IN (SELECT contract_address FROM raw_tvl)
			`,
			defaultDecimals: 18,
		}
	}

	return ecosystemConfig[ecosystem] ?? ecosystemConfig.evm;
};

const getDuneVolumeQuery = (duneChain: string, fromTimestamp: number, toTimestamp: number): string => {
	const queryConfig = getChainQueryConfig(duneChain);

	return `
    WITH
    -- 1) Get marketplace addresses 
    mp AS (
        SELECT MAX(contract_address) AS marketplace
        FROM dune.secondswapio.result_get_all_spot_purchase_events_from_marketplace
        WHERE chain = '${duneChain}'
    ),

    -- 2) Get relevant tx hashes of spot_purchase events
    mp_txs AS (
        SELECT evt_tx_hash
        FROM dune.secondswapio.result_get_all_spot_purchase_events_from_marketplace
        WHERE from_unixtime(${fromTimestamp}) <= evt_block_time
        AND from_unixtime(${toTimestamp}) >= evt_block_time 
        AND chain = '${duneChain}'
    ),

    -- 3) Pre-filter transfers by marketplace transactions
    filtered_transfers AS (${queryConfig.filteredTransfers(fromTimestamp, toTimestamp)}
    ),

    -- 4) Retain transfers to marketplace address
    mp_transfers AS (
        SELECT f.contract_address,
               f.value,
               f.evt_block_date
        FROM filtered_transfers f
        JOIN mp
        ON f."to" = mp.marketplace
    ),

    -- 5) Aggregate by date + token
    raw_tvl AS (
        SELECT
            contract_address,
            evt_block_date AS date,
            SUM(value) AS value
        FROM mp_transfers
        GROUP BY evt_block_date, contract_address
    ),

    -- 6) Fetch token decimals
    token_decimals AS (${queryConfig.tokenDecimals})

    SELECT
        SUM(r.value / POW(10, COALESCE(t.decimals, ${queryConfig.defaultDecimals}))) AS usd_volume
    FROM raw_tvl r
    LEFT JOIN token_decimals t
    ON r.contract_address = t.contract_address
  `;
}

const llamaChainToDuneChain = {
	[CHAIN.ETHEREUM]: 'ethereum',
	[CHAIN.AVAX]: 'avalanche_c',
	[CHAIN.SOLANA]: 'solana',
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	try {
		const duneChain = llamaChainToDuneChain[options.chain];
		if (!duneChain) {
			console.error(`No Dune chain mapping found for defillama chain ${options.chain}`);
			return { dailyVolume: 0 }
		}
		const query = getDuneVolumeQuery(duneChain, options.startTimestamp, options.endTimestamp);
		const volumeQueryResult = await queryDuneSql(options, query)

		if (!volumeQueryResult || volumeQueryResult.length === 0 || volumeQueryResult[0].usd_volume === null) {
			return { dailyVolume: 0 }
		}

		const usdVolume = volumeQueryResult[0].usd_volume

		return {
			dailyVolume: usdVolume,
		}
	} catch (error) {
		return { dailyVolume: 0 }
	}
};

const adapter: SimpleAdapter = {
	fetch,
	dependencies: [Dependencies.DUNE],
	adapter: {
		[CHAIN.ETHEREUM]: {
			fetch: fetch,
			start: '2024-12-01',
		},
		[CHAIN.AVAX]: {
			fetch: fetch,
			start: '2024-12-01',
		},
		[CHAIN.SOLANA]: {
			fetch: fetch,
			start: '2024-12-01',
		},
	},
	isExpensiveAdapter: true,
};

export default adapter
