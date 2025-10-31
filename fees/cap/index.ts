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
		minterFees.add(feeAsset, amount);
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
		protocolFees.add(feeAsset, amount);
	}

	const restakerFeesLogs = await options.getLogs({
		target: infra.delegation.address,
		eventAbi: capABI.Delegation.DistributeReward,
	});
	const restakerFees = options.createBalances();
	for (const log of restakerFeesLogs) {
		restakerFees.add(log.asset, log.amount);
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
	dailyFees.addBalances(minterFees);
	dailyFees.addBalances(protocolFees);
	dailyFees.addBalances(restakerFees);
	dailyFees.addBalances(insuranceFundFees);

	const dailyRevenue = options.createBalances();
	dailyRevenue.addBalances(protocolFees);

	const dailySupplySideRevenue = dailyFees.clone();
	dailySupplySideRevenue.subtract(dailyRevenue)

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

const adapter: SimpleAdapter = {
	version: 2,
	fetch,
	chains: [CHAIN.ETHEREUM],
	start: capConfig[CHAIN.ETHEREUM].fromDate,
	methodology,
};

export default adapter;
