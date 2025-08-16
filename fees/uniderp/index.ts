import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const LAUNCH_FEE = 0.00069; // 0.00069 ETH for each token created
const config = {
	[CHAIN.UNICHAIN]: {
		poolManager: "0x1f98400000000000000000000000000000000004",
		uniderpLauncher: "0xb42B41140d921b621246016eC0ecb8dbE3216948",
		uniderpHook: "0xcc2efb167503f2d7df0eae906600066aec9e8444",
		start: "2025-05-29",
		fromBlock: 17670688
	},
}

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
	const { createBalances } = options;

	const dailyFees = createBalances();
	const dailyProtocolRevenue = createBalances();

	// Get all data from Dune query
	const result = await queryDuneSql(options, `
		WITH volume_data AS (
			SELECT 
				SUM(amount_usd) as volume
			FROM dex.trades
			WHERE blockchain = 'unichain'
				AND project = 'uniswap'
				AND version = '4'
				AND tx_hash IN (
					SELECT evt_tx_hash
					FROM uniswap_v4_unichain.poolmanager_evt_swap
					WHERE id IN (
						SELECT id
						FROM uniswap_v4_unichain.poolmanager_evt_initialize
						WHERE hooks = 0xcc2efb167503f2d7df0eae906600066aec9e8444
					)
				)
				AND block_time >= from_unixtime(${options.startTimestamp})
				AND block_time < from_unixtime(${options.endTimestamp})
		),
		pool_count_data AS (
			SELECT COUNT(*) as pool_count
			FROM uniswap_v4_unichain.poolmanager_evt_initialize 
			WHERE hooks = 0xcc2efb167503f2d7df0eae906600066aec9e8444
			AND evt_block_time >= from_unixtime(${options.startTimestamp})
			AND evt_block_time < from_unixtime(${options.endTimestamp})
		),
		fee_data AS (
			SELECT 
				token,
				feeType,
				SUM(amount) as total_amount
			FROM uniderp_unichain.uniderphook_evt_feetaken
			WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
			AND evt_block_time < from_unixtime(${options.endTimestamp})
			GROUP BY token, feeType
		)
		SELECT 
			COALESCE(v.volume, 0) as volume,
			p.pool_count,
			f.token,
			f.feeType,
			f.total_amount
		FROM volume_data v
		CROSS JOIN pool_count_data p
		LEFT JOIN fee_data f ON 1=1
	`);

	const dailyVolume = result[0]?.volume || 0;
	const poolCount = result[0]?.pool_count || 0;
	
	const swapFeeAmount = dailyVolume * 0.0101 * 1e18;
	dailyFees.addGasToken(swapFeeAmount);

	const launchFeeAmount = poolCount * LAUNCH_FEE * 1e18;
	dailyFees.addGasToken(launchFeeAmount);
	dailyProtocolRevenue.addGasToken(launchFeeAmount);

	for (const row of result) {
		if (row.token && row.total_amount) {
			dailyFees.addToken(row.token, row.total_amount);
			if (row.feeType === 0) {
				// platform fees (feeType 0)
				dailyProtocolRevenue.addToken(row.token, row.total_amount);
			}
		}
	}

	const dailyUserFees = dailyFees.clone();
	const dr = dailyFees.clone().resizeBy(0.5);
	dailyProtocolRevenue.addBalances(dr); // 50% of user fees (0.5% of volume)
	const dailySupplySideRevenue = dr.clone().resizeBy(0.01); // 1% of user fees (0.01% of volume)

	return {
		dailyFees,
		dailyRevenue: dailyProtocolRevenue,
		dailyUserFees,
		dailyProtocolRevenue,
		dailySupplySideRevenue
	};
}

const methodology = {
	UserFees: "User pays 1.01% fees on each swap.",
	Fees: "All fees comes from the user. User pays 1.01% fees on each swap.",
	Revenue: "Treasury receives 0.51% of each swap. (0.5% from swap + 0.01% from LPs) + Launch Fees (0.00069 ETH for each token created)",
	ProtocolRevenue: "Treasury receives 0.51% of each swap. (0.5% from swap + 0.01% from LPs) + Launch Fees (0.00069 ETH for each token created)"
}

const adapter: SimpleAdapter = {
	version: 1,
	adapter: Object.keys(config).reduce((acc, chain) => {
		const { start } = config[chain];
		acc[chain] = {
			fetch,
			start: start,
		};
		return acc;
	}, {}),
	methodology,
};

export default adapter;