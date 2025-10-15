import ADDRESSES from './coreAssets.json'
import { FetchOptions, } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { queryIndexer, toByteaArray } from "../helpers/indexer";
import { CHAIN } from './chains';
import { METRIC } from './metrics';

const feeWallet = '0x4200000000000000000000000000000000000011';
const l1FeeVault = '0x420000000000000000000000000000000000001a';
const baseFeeVault = '0x4200000000000000000000000000000000000019';

async function getFees(options: FetchOptions, { feeVaults, gasToken }: { feeVaults: string[], gasToken?: string }) {
  const { api, fromApi, createBalances, getLogs } = options;
  const balances = createBalances();
  const eventAbi = 'event Withdrawal(uint256 value, address to, address from)'

  await api.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })
  await fromApi.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })

  const logs = await getLogs({ targets: feeVaults, eventAbi, })

  logs.map((log) => {
    if (gasToken)
      balances.addTokenVannila(gasToken, log.value)
    else
      balances.addGasToken(log.value)
  })

  balances.addBalances(api.getBalancesV2())
  balances.subtract(fromApi.getBalancesV2())
  return balances
}

export function L2FeesFetcher({
  feeVaults = [feeWallet, l1FeeVault, baseFeeVault],
  ethereumWallets,
  gasToken,
}: {
  gasToken?: string;
  feeVaults?: string[];
  ethereumWallets: string[];
}): any {
  	return async (options: FetchOptions) => {
		const sequencerGas = queryIndexer(`
				SELECT
					sum(ethereum.transactions.gas_used * ethereum.transactions.gas_price) AS sum
				FROM
					ethereum.transactions
					INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
				WHERE (to_address IN ${toByteaArray(ethereumWallets)}) AND (block_time BETWEEN llama_replace_date_range);
					`, options);
		const [dailyFees, totalSpentBySequencer] = await Promise.all([getFees(options, { feeVaults, gasToken }), sequencerGas]);
		const dailyRevenue = dailyFees.clone()
		if (gasToken)
		dailyRevenue.addTokenVannila(gasToken, (totalSpentBySequencer as any)[0].sum * -1)
		else
		dailyRevenue.addGasToken((totalSpentBySequencer as any)[0].sum * -1)
		return { dailyFees, dailyRevenue, }
  }
}


export const fetchL2FeesWithDune = async (options: FetchOptions, chain_name?: string) => {
    const chainName = chain_name || options.chain;
	const ROLLUP_ECONOMICS_NAME_MAP: any = {
		// EVM
		[CHAIN.ARBITRUM]: 'arbitrum',
		[CHAIN.BASE]: 'base',
		[CHAIN.BLAST]: 'blast',
		[CHAIN.LINEA]: 'linea',
		[CHAIN.MANTLE]: 'mantle',
		[CHAIN.OPTIMISM]: 'op mainnet',
		[CHAIN.SCROLL]: 'scroll',
		// [CHAIN.MODE]: 'mode',
		// [CHAIN.IMX]: 'imx',
		[CHAIN.METIS]: 'metis',
		[CHAIN.MANTA]: 'manta pacific',
		[CHAIN.ERA]: 'zksync era',
		[CHAIN.FRAXTAL]: 'fraxtal',
		[CHAIN.BOBA]: 'boba',
		[CHAIN.POLYGON_ZKEVM]: 'polygon zkevm',
		[CHAIN.ZORA]: 'zora',
		[CHAIN.LYRA]: 'lyra',
		[CHAIN.OP_BNB]: 'opbnb',

		// Non-EVM
		[CHAIN.STARKNET]: 'starknet',
	}

	const rollup_chain_name = ROLLUP_ECONOMICS_NAME_MAP[options.chain];
    const query = `WITH
		l2_fees_cte AS (
		SELECT
			SUM(tx_fee) AS l2_fees,
			SUM(tx_fee_usd) AS l2_fees_usd
		FROM gas.fees
		WHERE blockchain = '${chainName}'
			AND block_time >= from_unixtime(${options.startTimestamp})
			AND block_time <= from_unixtime(${options.endTimestamp})
		),
		l1_fees_cte AS (
			SELECT
				SUM(data_fee_native) AS l1_calldata_cost,
				SUM(blob_fee_native) AS l1_blob_cost,
				SUM(verification_fee_native) AS l1_verify_cost,
				SUM(data_fee_usd) AS l1_calldata_cost_usd,
				SUM(blob_fee_usd) AS l1_blob_cost_usd,
				SUM(verification_fee_usd) AS l1_verify_cost_usd
		FROM rollup_economics_ethereum.l1_fees
		WHERE day >= from_unixtime(${options.startTimestamp})
			AND day <= from_unixtime(${options.endTimestamp - 1})
			AND name = '${rollup_chain_name}'
		)
		SELECT
			COALESCE((SELECT l2_fees FROM l2_fees_cte), 0) AS total_fee,
			(COALESCE((SELECT l2_fees FROM l2_fees_cte), 0) - (
				COALESCE((SELECT l1_calldata_cost FROM l1_fees_cte), 0) +
				COALESCE((SELECT l1_blob_cost FROM l1_fees_cte), 0) +
				COALESCE((SELECT l1_verify_cost FROM l1_fees_cte), 0))
			) AS total_revenue,
			COALESCE((SELECT l2_fees_usd FROM l2_fees_cte), 0) AS total_fee_usd,
			(COALESCE((SELECT l2_fees_usd FROM l2_fees_cte), 0) - (
				COALESCE((SELECT l1_calldata_cost_usd FROM l1_fees_cte), 0) +
				COALESCE((SELECT l1_blob_cost_usd FROM l1_fees_cte), 0) +
				COALESCE((SELECT l1_verify_cost_usd FROM l1_fees_cte), 0))
			) AS total_revenue_usd
    `;

	const feesResult: any[] = await queryDuneSql(options, query);

	const dailyFees = options.createBalances();
	const dailyRevenue = options.createBalances();

	dailyFees.addGasToken(feesResult[0].total_fee * 1e18, METRIC.TRANSACTION_GAS_FEES); // all from above list has 18 decimals
	dailyRevenue.addGasToken(feesResult[0].total_revenue * 1e18, METRIC.TRANSACTION_GAS_FEES); // all from above list has 18 decimals

	return { dailyFees, dailyRevenue };
}; 