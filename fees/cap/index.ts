import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";
import { CHAIN } from "../../helpers/chains";
import { capABI, capConfig } from "./config";
import { fetchAssetAddresses, fetchVaultConfigs } from "./helpers";

const fetch = async (options: FetchOptions) => {
	const infra = capConfig[options.chain].infra;
	const assetAddresses = await fetchAssetAddresses(options, options.chain);
	const vaultConfigs = await fetchVaultConfigs(options);

	const feesDistributedLogs = (
		await Promise.all(
			vaultConfigs
				.map((vaultConfig) =>
					vaultConfig.interestReceivers.map(async (interestReceiver) => {
						const logs = await options.getLogs({
							target: interestReceiver,
							eventAbi: capABI.FeeReceiver.FeesDistributedEvent,
						});

						return logs.map((log) => ({
							feeAsset: vaultConfig.vault, // fee is collected in vault assets
							amount: log.amount,
						}));
					}),
				)
				.flat(),
		)
	).flat();
	const minterFees = options.createBalances();
	for (const { feeAsset, amount } of feesDistributedLogs) {
		minterFees.add(feeAsset, amount, 'Borrow Fees Distributed to Stakers');
	}

	const protocolFeeClaimedLogs = (
		await Promise.all(
			vaultConfigs
				.map((vaultConfig) =>
					vaultConfig.interestReceivers.map(async (interestReceiver) => {
						const logs = await options.getLogs({
							target: interestReceiver,
							eventAbi: capABI.FeeReceiver.ProtocolFeeClaimed,
						});

						return logs.map((log) => ({
							feeAsset: vaultConfig.vault, // fee is collected in vault assets
							amount: log.amount,
						}));
					}),
				)
				.flat(),
		)
	).flat();
	const protocolFees = options.createBalances();
	for (const { feeAsset, amount } of protocolFeeClaimedLogs) {
		protocolFees.add(feeAsset, amount, 'Protocol Borrow Fee Cut');
	}

	const restakerFeesLogs = await options.getLogs({
		target: infra.delegation.address,
		eventAbi: capABI.Delegation.DistributeReward,
	});
	const restakerFees = options.createBalances();
	for (const log of restakerFeesLogs) {
		restakerFees.add(log.asset, log.amount, 'Restaker Delegation Rewards');
	}

	const insuranceFunds = vaultConfigs
		.map((i) => i.insuranceFund)
		.filter((i) => i !== null);
	const minters = vaultConfigs.map((i) => i.vault);
	const insuranceFundFees =
		insuranceFunds.length > 0
			? await addTokensReceived({
				options,
				fromAdddesses: minters,
				tokens: assetAddresses,
				targets: insuranceFunds,
			})
		: options.createBalances();

	const dailyFees = options.createBalances();
	dailyFees.addBalances(minterFees, 'Borrow Fees Distributed to Stakers');
	dailyFees.addBalances(protocolFees, 'Protocol Borrow Fee Cut');
	dailyFees.addBalances(restakerFees, 'Restaker Delegation Rewards');
	dailyFees.addBalances(insuranceFundFees, 'Insurance Fund Fees');

	const dailyRevenue = options.createBalances();
	dailyRevenue.addBalances(protocolFees, 'Protocol Borrow Fee Cut');

	const dailySupplySideRevenue = options.createBalances();
	dailySupplySideRevenue.addBalances(minterFees, 'Borrow Fees Distributed to Stakers');
	dailySupplySideRevenue.addBalances(restakerFees, 'Restaker Delegation Rewards');
	dailySupplySideRevenue.addBalances(insuranceFundFees, 'Insurance Fund Fees');

	return {
		dailyFees,
		dailySupplySideRevenue,
		dailyRevenue: dailyRevenue,
		dailyProtocolRevenue: dailyRevenue,
	};
};

const methodology = {
	Fees: "All fees paid by users for either borrowing (borrow fees + restaker fees) or minting (insurance fund fees).",
	Revenue: "Share of borrow fees for protocol",
	SupplySideRevenue: "Borrow fees distributed to stakers and restaker fees are distributed to delegators.",
	ProtocolRevenue: "Share of borrow fees for protocol",
};

const breakdownMethodology = {
	Fees: {
		'Borrow Fees Distributed to Stakers': 'Interest fees from borrowing distributed to vault stakers.',
		'Protocol Borrow Fee Cut': 'Protocol\'s share of borrow fees claimed separately.',
		'Restaker Delegation Rewards': 'Rewards distributed to delegators via the delegation contract.',
		'Insurance Fund Fees': 'Tokens sent from minters to insurance funds for risk management.',
	},
	Revenue: {
		'Protocol Borrow Fee Cut': 'Protocol\'s share of borrow fees.',
	},
	SupplySideRevenue: {
		'Borrow Fees Distributed to Stakers': 'Interest fees distributed to vault stakers.',
		'Restaker Delegation Rewards': 'Rewards distributed to delegators.',
		'Insurance Fund Fees': 'Tokens sent to insurance funds from minters.',
	},
	ProtocolRevenue: {
		'Protocol Borrow Fee Cut': 'Protocol\'s share of borrow fees.',
	},
};

const adapter: SimpleAdapter = {
	version: 2,
	fetch,
	chains: [CHAIN.ETHEREUM],
	start: capConfig[CHAIN.ETHEREUM].fromDate,
	methodology,
	breakdownMethodology,
};

export default adapter;
