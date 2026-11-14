import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { buildL1FeesDuneQuery, getIndexerL2FeesWei } from "../helpers/ethereum-l2";
import { METRIC } from "../helpers/metrics";

// ZKsync Era settles each batch on Ethereum by committing, proving and executing it on its chain contract (diamond
// proxy), which emits BlockCommit / BlocksVerification / BlockExecution. The contract the operators call has changed
// several times, so the L1 cost is keyed on those events, not on a caller:
// - 2025-07-28 to 2026-01-31: Era settled on ZKsync Gateway, and the diamond emits no batch events on Ethereum
// - 2026-02-01 to 2026-04-28 16:19 UTC: operators call the shared ValidatorTimelock 0x2e5110cf18678ec99818bfaa849b8c881744b776
// - since 2026-04-28 16:19 UTC: they call the EraMultisigValidator below, which forwards to that timelock
// Dune's rollup_economics 'zksync era' row sees none of these. Since 2025-12-26 it only holds other ZK chains' batches
// (chain ids 1217, 1345, 543210) on the old ValidatorTimelock 0x8c0Bfc04AdA21fd496c55B8C50331f904306F564. It stays
// the source before 2026-02-01 so that history is unchanged.
const ERA_DIAMOND = '0x32400084c286cf3e17e7b677ea9583e60a000324';
const BATCH_EVENTS = {
	commit: '0x8f2916b2f2d78cc5890ead36c06c0f6d5d112c7e103589947e8e2f0d6eddb763', // BlockCommit(uint256,bytes32,bytes32)
	prove: '0x22c9005dd88c18b552a1cd7e8b3b937fcde9ca69213c1f658f54d572e4877a81', // BlocksVerification(uint256,uint256)
	execute: '0x2402307311a4d6604e4e7b4c8a15a7e1213edb39c16a31efa70afb06030d3165', // BlockExecution(uint256,bytes32,bytes32)
};
const ALLIUM_L1_COSTS_FROM = 1769904000; // 2026-02-01, the first day back on Ethereum after the Gateway period
const DUNE_ROLLUP_NAME = 'zksync era'; // name in rollup_economics_ethereum.l1_fees

// threshold() went from 0 to 3 in block 24993002 (2026-04-30 12:44:23 UTC). Since then executeBatchesSharedBridge
// reverts NotEnoughSignatures unless validators approved the batch with approveHash(bytes32), so the approvals are
// part of settling it. Before that block they were a dry run. Sample approval: 0x597842c0dbc41d5ccf70e4b05a2cb52a1f0948ec7485a92d01890d15a306f0c7
// The validators are funded by the same Safe 0x9e543149DdfEEE18e95A4655D07096398Dd2Bf52 as the batch operators.
const ERA_MULTISIG_VALIDATOR = '0xdc26b08f0335b68721f64001c38b05d0bc9b539d';
const APPROVE_HASH = '0xd4d9bdcd'; // approveHash(bytes32)
const APPROVALS_REQUIRED_FROM_BLOCK = 24993002;
const APPROVALS_REQUIRED_FROM = 1777553063; // timestamp of that block

const L1_BATCH_POSTING_COSTS = 'Ethereum L1 Batch Posting Costs';
const L1_PROOF_VERIFICATION_COSTS = 'Ethereum L1 Proof Verification Costs';
const L1_BATCH_EXECUTION_COSTS = 'Ethereum L1 Batch Execution Costs';
const L1_VALIDATOR_APPROVAL_COSTS = 'Ethereum L1 Validator Approval Costs';

const settlementCostSql = (options: FetchOptions) => {
	const from = `TO_TIMESTAMP_NTZ(${options.startTimestamp})`;
	const to = `TO_TIMESTAMP_NTZ(${options.endTimestamp})`;
	return `
		WITH batch_logs AS (
			SELECT transaction_hash, topic0
			FROM ethereum.raw.logs
			WHERE address = '${ERA_DIAMOND}'
				AND topic0 IN (${Object.values(BATCH_EVENTS).map((t) => `'${t}'`).join(', ')})
				AND block_timestamp >= ${from} AND block_timestamp < ${to}
		),
		-- a settlement tx commits, proves or executes, one event per batch it covers
		batch_txs AS (
			SELECT transaction_hash, MIN(topic0) AS step FROM batch_logs GROUP BY 1
		),
		settlement_txs AS (
			SELECT
				t.to_address,
				t.block_number,
				COALESCE(b.step, 'approval') AS step,
				t.receipt_gas_used * t.receipt_effective_gas_price
					+ COALESCE(t.receipt_blob_gas_used, 0) * COALESCE(t.receipt_blob_gas_price, 0) AS cost_wei
			FROM ethereum.raw.transactions t
			LEFT JOIN batch_txs b ON b.transaction_hash = t.hash
			WHERE t.block_timestamp >= ${from} AND t.block_timestamp < ${to}
				AND t.receipt_status = 1
				AND (
					b.transaction_hash IS NOT NULL
					-- approveHash reverts NotSigner for non-members, so successful calls are validator approvals
					OR (t.to_address = '${ERA_MULTISIG_VALIDATOR}' AND LEFT(t.input, 10) = '${APPROVE_HASH}' AND t.block_number >= ${APPROVALS_REQUIRED_FROM_BLOCK})
				)
		)
		SELECT
			(SELECT COUNT_IF(topic0 = '${BATCH_EVENTS.commit}') FROM batch_logs) AS commits,
			(SELECT COUNT_IF(topic0 = '${BATCH_EVENTS.prove}') FROM batch_logs) AS proofs,
			(SELECT COUNT_IF(topic0 = '${BATCH_EVENTS.execute}') FROM batch_logs) AS executions,
			(SELECT COUNT_IF(step = 'approval') FROM settlement_txs) AS approvals,
			(SELECT COUNT_IF(step <> 'approval' AND block_number >= ${APPROVALS_REQUIRED_FROM_BLOCK} AND to_address <> '${ERA_MULTISIG_VALIDATOR}') FROM settlement_txs) AS batch_txs_elsewhere,
			(SELECT TO_VARCHAR(COALESCE(SUM(IFF(step = '${BATCH_EVENTS.commit}', cost_wei, 0)), 0)) FROM settlement_txs) AS commit_wei,
			(SELECT TO_VARCHAR(COALESCE(SUM(IFF(step = '${BATCH_EVENTS.prove}', cost_wei, 0)), 0)) FROM settlement_txs) AS prove_wei,
			(SELECT TO_VARCHAR(COALESCE(SUM(IFF(step = '${BATCH_EVENTS.execute}', cost_wei, 0)), 0)) FROM settlement_txs) AS execute_wei,
			(SELECT TO_VARCHAR(COALESCE(SUM(IFF(step = 'approval', cost_wei, 0)), 0)) FROM settlement_txs) AS approval_wei,
			(SELECT COUNT(*) FROM ethereum.raw.transactions
				WHERE block_timestamp >= ${to} AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 60})) AS txs_after_window
	`;
};

// L1 cost per supply side label, in wei
const getAlliumL1Costs = async (options: FetchOptions): Promise<Record<string, bigint> | null> => {
	let rows: any[];
	try {
		rows = await queryAllium(settlementCostSql(options));
	} catch (e) {
		// the L1 cost only corrects revenue: when the lookup fails, publish the fees and leave revenue out
		console.error('zksync-era: L1 settlement cost lookup failed, publishing fees without revenue', e);
		return null;
	}
	const costs = rows?.[0];
	if (!costs || !(Number(costs.txs_after_window) > 0))
		throw new Error(`zksync-era: Allium has not indexed Ethereum past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
	// Era settles a batch about every 30 minutes, so a step with no event means settlement moved (e.g. back to Gateway)
	const missing = ['commits', 'proofs', 'executions'].filter((k) => !(Number(costs[k]) > 0));
	if (missing.length)
		throw new Error(`zksync-era: no Era batch ${missing.join(', ')} on Ethereum in this window, refusing to report revenue without the L1 cost`);
	if (options.endTimestamp > APPROVALS_REQUIRED_FROM && !(Number(costs.approvals) > 0))
		throw new Error(`zksync-era: no approveHash call on the EraMultisigValidator ${ERA_MULTISIG_VALIDATOR} in this window, the approvals moved`);
	if (Number(costs.batch_txs_elsewhere) > 0)
		throw new Error(`zksync-era: ${costs.batch_txs_elsewhere} Era batch txs bypassed the EraMultisigValidator, a new validator contract needs its approvals tracked`);

	return {
		[L1_BATCH_POSTING_COSTS]: BigInt(costs.commit_wei),
		[L1_PROOF_VERIFICATION_COSTS]: BigInt(costs.prove_wei),
		[L1_BATCH_EXECUTION_COSTS]: BigInt(costs.execute_wei),
		[L1_VALIDATOR_APPROVAL_COSTS]: BigInt(costs.approval_wei),
	};
};

// before 2026-02-01: Dune's daily rollup economics, missing values count as zero as the shared L2 helper always did
const getDuneL1Costs = async (options: FetchOptions): Promise<Record<string, bigint>> => {
	const rows = await queryDuneSql(options, buildL1FeesDuneQuery(DUNE_ROLLUP_NAME, options.startTimestamp, options.endTimestamp));
	const wei = (column: string) => BigInt(Math.round((Number(rows?.[0]?.[column]) || 0) * 1e18));
	return {
		[L1_BATCH_POSTING_COSTS]: wei('l1_calldata_native') + wei('l1_blob_native'),
		[L1_PROOF_VERIFICATION_COSTS]: wei('l1_verify_native'),
	};
};

const fetch = async (options: FetchOptions) => {
	const [l2FeesWei, l1Costs] = await Promise.all([
		getIndexerL2FeesWei(options),
		options.startTimestamp < ALLIUM_L1_COSTS_FROM ? getDuneL1Costs(options) : getAlliumL1Costs(options),
	]);
	if (l2FeesWei === null) throw new Error('zksync-era: no Era block past the reorg margin in this window yet');

	const dailyFees = options.createBalances();
	dailyFees.addGasToken(l2FeesWei.toString(), METRIC.TRANSACTION_GAS_FEES);
	if (!l1Costs) return { dailyFees };

	const dailySupplySideRevenue = options.createBalances();
	let l1CostWei = 0n;
	for (const [label, wei] of Object.entries(l1Costs)) {
		dailySupplySideRevenue.addGasToken(wei.toString(), label);
		l1CostWei += wei;
	}
	const dailyRevenue = options.createBalances();
	dailyRevenue.addGasToken((l2FeesWei - l1CostWei).toString(), METRIC.TRANSACTION_GAS_FEES);
	return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
	version: 1, // daily: the history before 2026-02-01 comes from Dune
	fetch,
	chains: [CHAIN.ERA],
	start: '2023-02-14',
	protocolType: ProtocolType.CHAIN,
	dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
	isExpensiveAdapter: true,
	allowNegativeValue: true, // revenue goes negative on days the ETH spent on Ethereum exceeds the L2 gas fees
	methodology: {
		Fees: 'Transaction fees paid by users on ZKsync Era.',
		Revenue: 'Transaction fees paid by users on ZKsync Era, minus the ETH spent on Ethereum to settle Era batches.',
		SupplySideRevenue: 'ETH spent on Ethereum to settle ZKsync Era batches: posting batch data, verifying proofs, executing batches and, since 30 April 2026, the batch approvals of its multisig validators.',
	},
	breakdownMethodology: {
		Fees: {
			[METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for transactions on ZKsync Era.',
		},
		Revenue: {
			[METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users on ZKsync Era, minus the ETH spent on Ethereum to post, prove, execute and approve Era batches.',
		},
		SupplySideRevenue: {
			[L1_BATCH_POSTING_COSTS]: 'ETH spent on Ethereum to commit Era batches, including calldata and blob fees for the batch data.',
			[L1_PROOF_VERIFICATION_COSTS]: 'ETH spent on Ethereum to verify the validity proofs of Era batches.',
			[L1_BATCH_EXECUTION_COSTS]: 'ETH spent on Ethereum to execute proven Era batches, finalizing them (tracked separately since February 2026).',
			[L1_VALIDATOR_APPROVAL_COSTS]: 'ETH spent by the EraMultisigValidator signers on approveHash calls, which every batch needs before it can be executed since 30 April 2026.',
		},
	},
};

export default adapter;
