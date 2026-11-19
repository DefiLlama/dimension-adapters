import * as sdk from "@defillama/sdk";
import ADDRESSES from './coreAssets.json'
import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";
import { queryClickhouse } from "../helpers/indexer";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from './chains';
import { METRIC } from './metrics';
import { Row } from "./indexer";

const feeWallet = '0x4200000000000000000000000000000000000011';
const l1FeeVault = '0x420000000000000000000000000000000000001a';
const baseFeeVault = '0x4200000000000000000000000000000000000019';

// Sums an OP-stack chain's fee vaults over the day: the balance delta plus anything withdrawn out
// of them during the window. `withdrawingVaults` narrows which vaults' Withdrawal events are added
// back, for chains where one vault pays into another and the value never leaves the tracked set;
// it defaults to every vault, which is the plain OP-stack case.
export async function getFees(options: FetchOptions, { feeVaults, gasToken, withdrawingVaults }: { feeVaults: string[], gasToken?: string, withdrawingVaults?: string[] }) {
  const { api, fromApi, createBalances, getLogs } = options;
  const balances = createBalances();
  const eventAbi = 'event Withdrawal(uint256 value, address to, address from)'

  await api.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })
  await fromApi.sumTokens({ owners: feeVaults, tokens: [ADDRESSES.null] })

  const logs = await getLogs({ targets: withdrawingVaults ?? feeVaults, eventAbi, })

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

// Same total as getFees without Withdrawal logs, for chains whose RPC rejects useful getLogs ranges:
// every OP-stack FeeVault keeps totalProcessed(), the running sum of its withdrawals, so the fees the
// vaults accrued are the change in balance + totalProcessed. Needs archive state only. The opening
// state is read at the block before getFromBlock() (the previous window's last block) so hourly
// windows tile without gaps. `CGToken` prices the gas token when the sdk has no mapping for the chain.
export async function getFeesFromVaultCounters(options: FetchOptions, { feeVaults, CGToken }: { feeVaults: string[], CGToken?: string }) {
  const accrued = await getVaultCountersAccruedWei(options, feeVaults)
  const balances = options.createBalances()
  if (CGToken) balances.addCGToken(CGToken, Number(accrued) / 1e18)
  else balances.addGasToken(accrued.toString())
  return balances
}

async function getVaultCountersAccruedWei(options: FetchOptions, feeVaults: string[]): Promise<bigint> {
  const { chain } = options
  const accruedAt = async (block: number) => {
    const { output: vaultBalances } = await sdk.api2.eth.getBalances({ targets: feeVaults, chain, block })
    const processed = await sdk.api2.abi.multiCall({ abi: 'uint256:totalProcessed', calls: feeVaults, chain, block })
    return [...vaultBalances.map((b: any) => b.balance), ...processed].reduce((sum: bigint, value: any) => sum + BigInt(value), 0n)
  }
  const fromBlock = (await options.getFromBlock()) - 1
  const toBlock = await options.getToBlock()
  const accrued = (await accruedAt(toBlock)) - (await accruedAt(fromBlock))
  // balance + totalProcessed never decreases, a negative delta means a bad block lookup
  if (accrued < 0n) throw new Error(`${chain}: fee vault counters went down between blocks ${fromBlock} and ${toBlock}`)
  return accrued
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
		// ethereumWallets holds batch-inbox addresses (matched as to_address) or
		// batcher/proposer EOAs (matched as from_address), depending on the
		// chain config — match both sides so either style works.
		const sequencerWallets = ethereumWallets.map(w => `'${w.toLowerCase()}'`).join(', ');
		const sequencerGas = queryAllium(`
				SELECT
					SUM(receipt_gas_used * receipt_effective_gas_price) AS sequencer_gas
				FROM ethereum.raw.transactions
				WHERE (from_address IN (${sequencerWallets}) OR to_address IN (${sequencerWallets}))
					AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
					AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
			`);
		const [dailyFees, totalSpentBySequencer] = await Promise.all([getFees(options, { feeVaults, gasToken }), sequencerGas]);

		// SUM() over no matching rows is NULL — treat no matches as zero L1 cost
		// (revenue = fees)
		const spentBySequencer = (totalSpentBySequencer as any)?.[0]?.sequencer_gas ?? 0

		const dailyRevenue = dailyFees.clone()
		if (gasToken)
		dailyRevenue.addTokenVannila(gasToken, spentBySequencer * -1)
		else
		dailyRevenue.addGasToken(spentBySequencer * -1)
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
// The hybrid path only activates when the chain ALSO has a
// ROLLUP_ECONOMICS_NAME_MAP entry, so indexed rollups without a Spellbook
// label are inert here until one is added. Keep this set in sync with the
// indexer's chain list (metis and fraxtal are NOT indexed — a non-indexed
// chain in this set would report zero fees instead of falling back to Dune).
const INDEXER_SUPPORTED_CHAINS = new Set<string>([
	CHAIN.ARBITRUM, // 42161
	CHAIN.ARBITRUM_NOVA, // 42170
	CHAIN.BASE, // 8453
	CHAIN.BLAST, // 81457
	CHAIN.ERA, // 324, zksync era
	CHAIN.LINEA, // 59144
	CHAIN.MEGAETH, // 4326
	CHAIN.MODE, // 34443
	CHAIN.OPTIMISM, // 10
	CHAIN.OP_BNB, // 204
	CHAIN.POLYGON_ZKEVM, // 1101
	CHAIN.SCROLL, // 534352
	CHAIN.SONEIUM, // 1868
	CHAIN.UNICHAIN, // 130
	CHAIN.XLAYER, // 196
]);

// OP-stack rollups that dropped out of Dune's `gas.fees`: their L2 fees come from the fee vault counters
// (getVaultCountersAccruedWei) on the chain's own archive RPC, and only the L1 cost stays on Dune.
const FEE_VAULT_CHAINS = new Set<string>([
	CHAIN.ZORA,
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

// L2 fees of the window from the indexer, null when the window has no block past the 50-block reorg margin yet
export const getIndexerL2FeesWei = async (options: FetchOptions, chainName: string = options.chain): Promise<bigint | null> => {
	const fromBlock = Number(options.fromApi.block);
	const safeBlock = Number(options.toApi.block) - 50;
	if (safeBlock <= fromBlock) return null;

	const l2FeesRows = await queryClickhouse<L2FeesRow>(SQL_L2_FEES, {
		chain: Number(options.api.chainId),
		fromBlock,
		toBlock: safeBlock,
	});
	if (!l2FeesRows?.length || l2FeesRows[0]?.l2_fees_wei == null)
		throw new Error(`${chainName}: the indexer returned no row for this window, refusing to report it as zero fees`);
	return BigInt(l2FeesRows[0].l2_fees_wei);
};

// Small Dune query for L1 costs only - scans the tiny pre-aggregated
// `rollup_economics_ethereum.l1_fees` Spellbook table (~1 row per rollup per
// day). Negligible scan cost compared to the original `gas.fees` query.
export const buildL1FeesDuneQuery = (rollupName: string, fromTs: number, toTs: number) => `
  SELECT
    COUNT(*) AS l1_rows,
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
		const dailyFees = options.createBalances();
		const dailyRevenue = options.createBalances();

		const [l2FeesWei, l1FeesRows] = await Promise.all([
			getIndexerL2FeesWei(options, chainName),
			queryDuneSql(options, buildL1FeesDuneQuery(rollupName, options.startTimestamp, options.endTimestamp)) as Promise<any[]>,
		]);

		if (l2FeesWei === null) {
			return { dailyFees, dailyRevenue };
		}

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

	// --- Path B for FEE_VAULT_CHAINS: L2 fees from the fee vaults over RPC, L1 cost from the same small
	// Spellbook query as Path A. ---
	if (FEE_VAULT_CHAINS.has(options.chain) && rollupName) {
		const l2FeesWei = await getVaultCountersAccruedWei(options, [feeWallet, l1FeeVault, baseFeeVault]);
		const dailyFees = options.createBalances();
		dailyFees.addGasToken(l2FeesWei.toString(), METRIC.TRANSACTION_GAS_FEES);

		// the L1 cost only corrects revenue: when the lookup fails, publish the fees and leave revenue out
		let l1FeesRows: any[];
		try {
			l1FeesRows = await queryDuneSql(options, buildL1FeesDuneQuery(rollupName, options.startTimestamp, options.endTimestamp));
		} catch (e) {
			console.error(`${chainName}: L1 cost lookup failed, publishing fees without revenue`, e);
			return { dailyFees };
		}
		// a rollup that posts batches always has an L1 cost row, so none means rollup_economics has not caught up yet
		if (!Number(l1FeesRows?.[0]?.l1_rows))
			throw new Error(`${chainName}: rollup_economics_ethereum.l1_fees has no row for this window yet, not reporting revenue without the L1 cost`);

		const l1TotalEth = Number(l1FeesRows[0].l1_calldata_native) + Number(l1FeesRows[0].l1_blob_native) + Number(l1FeesRows[0].l1_verify_native);
		const dailyRevenue = options.createBalances();
		dailyRevenue.addGasToken((l2FeesWei - BigInt(Math.round(l1TotalEth * 1e18))).toString(), METRIC.TRANSACTION_GAS_FEES);
		return { dailyFees, dailyRevenue };
	}

	const DUNE_LAG_HOURS: Record<string, number> = { [CHAIN.ABSTRACT]: 24 };
	const lagHours = DUNE_LAG_HOURS[options.chain];
	if (lagHours && Date.now() / 1000 < options.endTimestamp + lagHours * 3600)
		throw new Error(`${chainName}: gas.fees lands ~${lagHours}h late on Dune, not querying a window that ended less than ${lagHours}h ago`);

	// --- Fallback: chains not in evm_indexer (abstract, boba, mantle,
	// manta, lyra, starknet, ...). Keeps the original Dune-only
	// behavior verbatim. Heavier than the hybrid path but covers chains the
	// indexer doesn't index. ---
	const query = `WITH
		l2_fees_cte AS (
		SELECT
			COUNT(*) AS l2_tx_count,
			COUNT(DISTINCT date_trunc('hour', block_time)) AS l2_hours,
			MAX(block_time) AS l2_last_block_time,
			SUM(tx_fee) AS l2_fees,
			SUM(tx_fee_usd) AS l2_fees_usd
		FROM gas.fees
		WHERE blockchain = '${chainName}'
			AND block_time >= from_unixtime(${options.startTimestamp})
			AND block_time < from_unixtime(${options.endTimestamp})
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
			COALESCE((SELECT l2_tx_count FROM l2_fees_cte), 0) AS l2_tx_count,
			COALESCE((SELECT l2_hours FROM l2_fees_cte), 0) AS l2_hours,
			(SELECT l2_last_block_time FROM l2_fees_cte) AS l2_last_block_time,
			COALESCE((SELECT l2_fees FROM l2_fees_cte), 0) AS total_fee,
			(COALESCE((SELECT l2_fees FROM l2_fees_cte), 0) - (
				COALESCE((SELECT l1_calldata_cost FROM l1_fees_cte), 0) +
				COALESCE((SELECT l1_blob_cost FROM l1_fees_cte), 0) +
				COALESCE((SELECT l1_verify_cost FROM l1_fees_cte), 0))
			) AS total_revenue,
			(COALESCE((SELECT l1_calldata_cost FROM l1_fees_cte), 0) +
				COALESCE((SELECT l1_blob_cost FROM l1_fees_cte), 0) +
				COALESCE((SELECT l1_verify_cost FROM l1_fees_cte), 0)
			) AS l1_cost_eth,
			COALESCE((SELECT l2_fees_usd FROM l2_fees_cte), 0) AS total_fee_usd,
			(COALESCE((SELECT l2_fees_usd FROM l2_fees_cte), 0) - (
				COALESCE((SELECT l1_calldata_cost_usd FROM l1_fees_cte), 0) +
				COALESCE((SELECT l1_blob_cost_usd FROM l1_fees_cte), 0) +
				COALESCE((SELECT l1_verify_cost_usd FROM l1_fees_cte), 0))
			) AS total_revenue_usd
    `;

	const feesResult: any[] = await queryDuneSql(options, query);

	// SUM over no rows is NULL and the COALESCE above turns that into 0, so a chain that falls out
	// of gas.fees would publish a zero day rather than fail. The count separates that from a chain
	// whose transactions genuinely cost nothing, which stays a legitimate zero.
	if (!Number(feesResult?.[0]?.l2_tx_count))
		throw new Error(`${chainName}: gas.fees returned no transactions for this window, refusing to report it as zero fees`);

	const expectedHours = Math.floor((options.endTimestamp - options.startTimestamp) / 3600);
	if (lagHours && Number(feesResult[0].l2_hours) < expectedHours)
		throw new Error(`${chainName}: gas.fees covers ${feesResult[0].l2_hours} of ${expectedHours} hours in this window (last row at ${feesResult[0].l2_last_block_time}), Dune has not caught up yet`);

	const dailyFees = options.createBalances();
	const dailyRevenue = options.createBalances();

	dailyFees.addGasToken(feesResult[0].total_fee * 1e18, METRIC.TRANSACTION_GAS_FEES); // all from above list has 18 decimals
	if (options.chain === CHAIN.MANTLE) {
		// Mantle's fees are in MNT but its L1 costs are in ETH: total_revenue subtracts them as raw numbers,
		// which prices the ETH cost as MNT, so subtract it as ETH instead.
		dailyRevenue.addGasToken(feesResult[0].total_fee * 1e18, METRIC.TRANSACTION_GAS_FEES);
		dailyRevenue.addCGToken('ethereum', -Number(feesResult[0].l1_cost_eth), METRIC.TRANSACTION_GAS_FEES);
	} else {
		dailyRevenue.addGasToken(feesResult[0].total_revenue * 1e18, METRIC.TRANSACTION_GAS_FEES); // all from above list has 18 decimals
	}

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
	// 'zksync-era' lives in fees/zksync-era.ts: its L1 cost comes from Allium since 2026-02-01
	'zora-chain': l2FeesDuneAdapter(CHAIN.ZORA, '2023-06-13', undefined, {
		Fees: 'Transaction fees paid by users',
		Revenue: 'Total revenue on Zora, calculated by subtracting the L1 Batch Costs from the total gas fees',
	}),
};

// OP-stack chains read from their fee vaults on the L2, with the sequencer's L1 spend (batch inbox
// or batcher/proposer wallets on Ethereum, via Allium) subtracted from revenue. See L2FeesFetcher.
type L2FeeVaultConfig = {
	chain: string;
	start: string;
	ethereumWallets: string[];
	feeVaults?: string[];
	gasToken?: string;
	methodology?: Record<string, string>;
	allowNegativeValue?: boolean;
};

const l2FeeVaultConfigs: Record<string, L2FeeVaultConfig> = {
	'ink': {
		chain: CHAIN.INK, start: '2024-12-20',
		// batch inbox from the superchain registry (rotation-proof, unlike the genesis batcher EOA
		// 0x500d7Ea6... this previously pointed at, which stopped submitting and zeroed the revenue metric)
		ethereumWallets: ['0x005969bf0EcbF6eDB6C47E5e94693b1C3651Be97'],
		methodology: {
			Fees: 'Transaction fees paid by users',
			Revenue: 'Total revenue on Ink, calculated by subtracting the L1 Batch Costs from the total gas fees',
		},
	},
	'manta': {
		chain: CHAIN.MANTA, start: '2023-09-09',
		ethereumWallets: ['0x30c789674ad3b458886bbc9abf42eee19ea05c1d', '0xAEbA8e2307A22B6824a9a7a39f8b016C357Cd1Fe'],
		allowNegativeValue: true, // sequencer fees
	},
	'polynomial': {
		chain: CHAIN.POLYNOMIAL, start: '2024-08-25',
		ethereumWallets: [
			'0x0bd57e83B5E0f9eCD84d559bB58e1EcFEEdD2565', // BATCH INBOX (superchain registry; rotation-proof)
			'0x5DA28F0186051a9F7b9eE2553FFdc165EB0A6714', // PROPOSER (genesis, inactive since rotation)
			'0x67a44CE38627F46F20b1293960559eD85Dd194F1', // BATCHER (genesis, inactive since rotation)
		],
	},
	'soneium': {
		chain: CHAIN.SONEIUM, start: '2024-12-29',
		ethereumWallets: ['0x6776BE80dBAda6A02B5F2095cF13734ac303B8d1'],
		methodology: {
			Fees: 'Transaction fees paid by users',
			Revenue: 'Total revenue on Soneium, calculated by subtracting the L1 Batch Costs from the total gas fees',
		},
	},
};

const l2FeeVaultProtocols: Record<string, Adapter> = {};
for (const [name, { chain, start, ethereumWallets, feeVaults, gasToken, methodology, allowNegativeValue }] of Object.entries(l2FeeVaultConfigs)) {
	l2FeeVaultProtocols[name] = {
		version: 2,
		adapter: { [chain]: { fetch: L2FeesFetcher({ ethereumWallets, feeVaults, gasToken }), start } },
		protocolType: ProtocolType.CHAIN,
		...(methodology ? { methodology } : {}),
		...(allowNegativeValue ? { allowNegativeValue } : {}),
	};
}

const l2FeesProtocols: Record<string, Adapter> = { ...l2FeesDuneProtocols, ...l2FeeVaultProtocols };

export const protocolList = Object.keys(l2FeesProtocols);
export const getAdapter = (name: string) => l2FeesProtocols[name];
