import { Dependencies, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
// Chain-specific configurations for transfers and token decimals
const getChainQueryConfig = (
	duneChain: string,
): {
	usdtDecimals: number
} => {
	const ecosystem = duneChain === 'solana' ? 'solana' : 'evm';

	const ecosystemConfig = {
		solana: {
			usdtDecimals: 6,
		},
		evm: {
			usdtDecimals: 6,
		}
	}

	return ecosystemConfig[ecosystem] ?? ecosystemConfig.evm;
};

const getDuneFeesQuery = (duneChain: string, fromTimestamp: number, toTimestamp: number): string => {
	const queryConfig = getChainQueryConfig(duneChain);

	return `
    WITH
    -- Get spot purchase events with fees
    spot_purchases AS (
        SELECT 
            evt_tx_hash,
            buyerfee,
            sellerfee
        FROM dune.secondswapio.result_get_all_spot_purchase_events_from_marketplace
        WHERE from_unixtime(${fromTimestamp}) <= evt_block_time
        AND from_unixtime(${toTimestamp}) >= evt_block_time 
        AND chain = '${duneChain}'
    )

    -- Aggregate fees with proper decimal conversion
    SELECT 
        SUM((s.buyerfee + s.sellerfee) / POW(10, ${queryConfig.usdtDecimals})) AS usd_fee
    FROM spot_purchases s
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
			return { dailyFees: 0, dailyRevenue: 0 }
		}
		const query = getDuneFeesQuery(duneChain, options.startTimestamp, options.endTimestamp);
		const feesQueryResult = await queryDuneSql(options, query)

		if (!feesQueryResult || feesQueryResult.length === 0 || feesQueryResult[0].usd_fee === null) {
			console.error(`No fees found for ${options.chain} on ${options.startOfDay}`);
			return { dailyFees: 0, dailyRevenue: 0 }
		}

		const { usd_fee } = feesQueryResult[0]

		return {
			dailyFees: usd_fee,
			dailyRevenue: usd_fee,
		}
	} catch (error) {
		console.error(`Error fetching fees for ${options.chain} on ${options.startOfDay}:`, error);
		return { dailyFees: 0, dailyRevenue: 0 }
	}
};

const methodology = {
	Fees: "SecondSwap facilitates trading of locked/vesting tokens. Trading fees paid by buyers and sellers on each spot purchase transaction.",
	Revenue: "SecondSwap currently retains 100% of trading fees as protocol revenue.",
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
