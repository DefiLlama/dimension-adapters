import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

// Chain-specific configurations for transfers and token decimals
const getChainQueryConfig = (
	duneChain: string,
): {
	filteredTransfers: (fromTimestamp: number, toTimestamp: number) => string;
	tokenDecimals: (sourceTable: string) => string;
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
			tokenDecimals: (sourceTable: string) => `
				SELECT token_mint_address AS contract_address, decimals
				FROM tokens_solana.fungible
				WHERE token_mint_address IN (SELECT contract_address FROM ${sourceTable})
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
			tokenDecimals: (sourceTable: string) => `
				SELECT contract_address, decimals
				FROM tokens.erc20
				WHERE contract_address IN (SELECT contract_address FROM ${sourceTable})
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

    -- 2) Get relevant txs from spot_purchase events
    mp_txs AS (
        SELECT evt_tx_hash,
               buyerfee,
               sellerfee
        FROM dune.secondswapio.result_get_all_spot_purchase_events_from_marketplace
        WHERE from_unixtime(${fromTimestamp}) <= evt_block_time
        AND from_unixtime(${toTimestamp}) >= evt_block_time 
        AND chain = '${duneChain}'
    ),

    -- 3) Pre-filter token transfers by marketplace transactions
    filtered_transfers AS (
        ${queryConfig.filteredTransfers(fromTimestamp, toTimestamp)}
    ),

    -- 4) Retain transfers to marketplace address and join with fees
    mp_transfers AS (
        SELECT 
            f.contract_address,
            f.value,
            m.buyerfee,
            m.sellerfee
        FROM filtered_transfers f
        JOIN mp ON f."to" = mp.marketplace
        JOIN mp_txs m ON f.evt_tx_hash = m.evt_tx_hash
    ),

    -- 5) Get unique payment tokens used
    payment_tokens AS (
        SELECT DISTINCT contract_address
        FROM mp_transfers
    ),

    -- 6) Fetch token decimals for payment tokens
    token_decimals AS (
        ${queryConfig.tokenDecimals('payment_tokens')}
    )

    -- 7) Aggregate volume and fees with proper decimal conversion
    SELECT 
        SUM(m.value / POW(10, COALESCE(td.decimals, ${queryConfig.defaultDecimals}))) AS usd_volume,
        SUM((m.buyerfee + m.sellerfee) / POW(10, COALESCE(td.decimals, ${queryConfig.defaultDecimals}))) AS usd_fee
    FROM mp_transfers m
    LEFT JOIN token_decimals td 
		ON m.contract_address = td.contract_address
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

		const {
			usd_volume,
			usd_fee
		} = volumeQueryResult[0]

		return {
			dailyVolume: usd_volume,
			dailyFees: usd_fee,
		}
	} catch (error) {
		return {
			dailyVolume: 0,
			dailyFees: 0,
		}
	}
};

const methodology = {
	Volume: "SecondSwap facilitates trading of locked/vesting tokens. Volume is calculated from the total value of quote tokens (e.g., USDT) spent by buyers in spot purchases, aggregated via Dune Analytics.",
	Fees: "Trading fees paid by buyers and sellers on each spot purchase transaction.",
};

const adapter: SimpleAdapter = {
	methodology,
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
