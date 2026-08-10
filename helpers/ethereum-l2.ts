import ADDRESSES from './coreAssets.json'
import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { queryClickhouse, queryIndexer, toByteaArray } from "../helpers/indexer";
import { CHAIN } from './chains';
import { METRIC } from './metrics';
import { Row } from "@clickhouse/client";

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


// Common rollup -> name mapping used by both the hybrid ClickHouse path and
// the Dune fallback path. Maps to the rollup label in Dune's
// `rollup_economics_ethereum.l1_fees` Spellbook table.
const ROLLUP_ECONOMICS_NAME_MAP: Record<string, string> = {
	// EVM
	[CHAIN.ARBITRUM]: 'arbitrum',
	[CHAIN.ABSTRACT]: 'abstract',
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
};

// Rollups whose chain data is present in evm_indexer.transactions. For these
// the heavy L2 `gas.fees` scan moves to ClickHouse; only the tiny pre-
// aggregated `rollup_economics_ethereum.l1_fees` Spellbook lookup stays on
// Dune. Chains outside this set fall back to the original Dune-only query.
// Coverage verified against the live indexer (chain ids 10/204/324/1101/
// 8453/42161/59144/81457/534352 all present).
const INDEXER_SUPPORTED_CHAINS = new Set<string>([
	CHAIN.ARBITRUM,
	CHAIN.BASE,
	CHAIN.BLAST,
	CHAIN.OPTIMISM,
	CHAIN.OP_BNB,
	CHAIN.POLYGON_ZKEVM,
	CHAIN.SCROLL,
	CHAIN.ERA, // zksync era
	CHAIN.LINEA,
	CHAIN.METIS,
	CHAIN.FRAXTAL,
]);

// L2 transaction fee sum from indexer v2: gas_used * effective_gas_price per
// tx. Direct replacement for Dune's `SUM(tx_fee) FROM gas.fees` — Dune's
// `gas.fees` Spellbook is essentially this same multiplication, just
// pre-computed for every EVM chain it tracks.
const SQL_L2_FEES = `
  SELECT
    CAST(sum(toDecimal256(gas_used, 0) * toDecimal256(effective_gas_price, 0)) AS String) AS l2_fees_wei
  FROM evm_indexer.transactions
  WHERE chain = {chain:UInt64}
    AND block_number >= {fromBlock:UInt32}
    AND block_number <  {toBlock:UInt32}
`;

type L2FeesRow = Row & { l2_fees_wei: string };

// Small Dune query for L1 costs only - scans the tiny pre-aggregated
// `rollup_economics_ethereum.l1_fees` Spellbook table (~1 row per rollup per
// day). Negligible scan cost compared to the original `gas.fees` query.
const buildL1FeesDuneQuery = (rollupName: string, fromTs: number, toTs: number) => `
  SELECT
    COALESCE(SUM(data_fee_native), 0) AS l1_calldata_native,
    COALESCE(SUM(blob_fee_native), 0) AS l1_blob_native,
    COALESCE(SUM(verification_fee_native), 0) AS l1_verify_native
  FROM rollup_economics_ethereum.l1_fees
  WHERE day >= from_unixtime(${fromTs})
    AND day <= from_unixtime(${toTs - 1})
    AND name = '${rollupName}'
`;

export const fetchL2FeesWithDune = async (options: FetchOptions, chain_name?: string) => {
	const chainName = chain_name || options.chain;
	const rollupName = ROLLUP_ECONOMICS_NAME_MAP[options.chain];

	// --- Path A (hybrid) for chains in evm_indexer ---
	// L2 fees from ClickHouse; L1 calldata/blob/verification still from Dune
	// but via a tiny Spellbook-only query (no `gas.fees` scan).
	if (INDEXER_SUPPORTED_CHAINS.has(options.chain) && rollupName) {
		const fromBlock = Number(options.fromApi.block);
		const safeBlock = Number(options.toApi.block) - 50;

		const dailyFees = options.createBalances();
		const dailyRevenue = options.createBalances();

		if (safeBlock <= fromBlock) {
			return { dailyFees, dailyRevenue };
		}

		const [l2FeesRows, l1FeesRows] = await Promise.all([
			queryClickhouse<L2FeesRow>(SQL_L2_FEES, {
				chain: Number(options.api.chainId),
				fromBlock,
				toBlock: safeBlock,
			}),
			queryDuneSql(options, buildL1FeesDuneQuery(rollupName, options.startTimestamp, options.endTimestamp)) as Promise<any[]>,
		]);

		const l2FeesWei = BigInt(l2FeesRows?.[0]?.l2_fees_wei ?? '0');
		const l1Calldata = Number(l1FeesRows?.[0]?.l1_calldata_native) || 0;
		const l1Blob     = Number(l1FeesRows?.[0]?.l1_blob_native)     || 0;
		const l1Verify   = Number(l1FeesRows?.[0]?.l1_verify_native)   || 0;
		const l1TotalEth = l1Calldata + l1Blob + l1Verify;

		dailyFees.addGasToken(l2FeesWei, METRIC.TRANSACTION_GAS_FEES);
		dailyRevenue.addGasToken(l2FeesWei, METRIC.TRANSACTION_GAS_FEES);
		// Subtract L1 cost from revenue. The same Number * 1e18 precision
		// trick as the original (daily L1 totals are small enough in ETH
		// terms that the rounding is invisible at human-readable scale).
		if (l1TotalEth > 0) {
			dailyRevenue.addGasToken(-l1TotalEth * 1e18);
		}

		return { dailyFees, dailyRevenue };
	}

	// --- Fallback: chains not in evm_indexer (abstract, boba, mantle,
	// zora-chain, manta, lyra, starknet, ...). Keeps the original Dune-only
	// behavior verbatim. Heavier than the hybrid path but covers chains the
	// indexer doesn't index. ---
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
			AND name = '${rollupName}'
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

function l2FeesDuneAdapter(chain: string, start: string, chainName?: string, methodology?: Record<string, string>): Adapter {
	const fetch = async (options: FetchOptions) => fetchL2FeesWithDune(options, chainName);
	return {
		version: 1, fetch, chains: [chain], start,
		protocolType: ProtocolType.CHAIN, dependencies: [Dependencies.DUNE],
		isExpensiveAdapter: true, allowNegativeValue: true,
		...(methodology ? { methodology } : {}),
	};
}

const l2FeesDuneProtocols: Record<string, Adapter> = {
	'abstract': l2FeesDuneAdapter(CHAIN.ABSTRACT, '2024-10-25'),
	'arbitrum': l2FeesDuneAdapter(CHAIN.ARBITRUM, '2021-08-10'),
	'base': l2FeesDuneAdapter(CHAIN.BASE, '2023-06-23'),
	'blast': l2FeesDuneAdapter(CHAIN.BLAST, '2024-02-24', undefined, {
		Fees: 'Transaction fees paid by users',
		Revenue: 'Total revenue on Blast, calculated by subtracting the L1 Batch Costs from the total gas fees',
	}),
	'boba': l2FeesDuneAdapter(CHAIN.BOBA, '2021-08-13'),
	'mantle': l2FeesDuneAdapter(CHAIN.MANTLE, '2023-07-02', undefined, {
		Fees: 'Transaction fees paid by users',
		Revenue: 'Total revenue on Mantle, calculated by subtracting the L1 Batch Costs from the total gas fees',
	}),
	'op-bnb': l2FeesDuneAdapter(CHAIN.OP_BNB, '2023-08-14', 'opbnb'),
	'optimism': l2FeesDuneAdapter(CHAIN.OPTIMISM, '2020-08-29'),
	'polygon-zkevm': l2FeesDuneAdapter(CHAIN.POLYGON_ZKEVM, '2023-03-24', 'zkevm', {
		Fees: 'Total transaction fees paid by users',
		Revenue: 'Total revenue on Polygon ZkEVM, calculated by subtracting the L1 Batch Costs from the total gas fees',
	}),
	'scroll': l2FeesDuneAdapter(CHAIN.SCROLL, '2023-10-10', undefined, {
		Fees: 'Transaction fees paid by users',
		Revenue: 'Total revenue on Scroll, calculated by subtracting the L1 Batch Costs from the total gas fees',
	}),
	'zksync-era': l2FeesDuneAdapter(CHAIN.ERA, '2023-02-14', 'zksync'),
	'zora-chain': l2FeesDuneAdapter(CHAIN.ZORA, '2023-06-13', undefined, {
		Fees: 'Transaction fees paid by users',
		Revenue: 'Total revenue on Zora, calculated by subtracting the L1 Batch Costs from the total gas fees',
	}),
};

export const protocolList = Object.keys(l2FeesDuneProtocols);
export const getAdapter = (name: string) => l2FeesDuneProtocols[name];