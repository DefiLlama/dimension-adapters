import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { capABI, capConfig } from "./config";
import { fetchAssetAddresses, fetchVaultConfigs } from "./helpers";
import ADDRESSES from "../../helpers/coreAssets.json";

const YIELD_FROM_DEFI = "Yields from DeFi Protocols";
const INSTITUTIONAL_BORROW_INTEREST = "Borrow Interest from Insitutional Borrowers";

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

	const idleFundsYield = options.createBalances();
	const fractionalReserveLogs = (
		await Promise.all(
			vaultConfigs.map((vaultConfig) =>
				options.getLogs({
					target: vaultConfig.vault,  
					eventAbi: capABI.FractionalReserve.InterestRealizedEvent,
				}),
			),
		)
	).flat();
	for (const log of fractionalReserveLogs) {
		idleFundsYield.add(log.asset, log.amount);
	}

	const delegationAddress = infra.delegation.address.toLowerCase();
	const realizeInterestLogs = await options.getLogs({
		target: infra.lender.address,
		eventAbi: capABI.Lender.RealizeInterestEvent,
	});
	const borrowerInterest = options.createBalances();
	for (const log of realizeInterestLogs) {
		if (log.interestReceiver.toLowerCase() === delegationAddress) continue;
		borrowerInterest.add(log.asset, log.realizedInterest);
	}

	const [idleFundsYieldUsd, borrowerInterestUsd] = await Promise.all([
		idleFundsYield.getUSDValue(),
		borrowerInterest.getUSDValue(),
	]);
	const grossYieldUsd = idleFundsYieldUsd + borrowerInterestUsd;

	const SCALE = 1_000_000_000n;
	const idleShare =
		grossYieldUsd > 0
			? BigInt(Math.round((idleFundsYieldUsd / grossYieldUsd) * Number(SCALE)))
			: 0n;

	const minterFees = options.createBalances();
	for (const { feeAsset, amount } of feesDistributedLogs) {
		const total = BigInt(amount);
		const idlePortion = (total * idleShare) / SCALE;
		const borrowPortion = total - idlePortion;
		minterFees.add(feeAsset, idlePortion, YIELD_FROM_DEFI);
		minterFees.add(feeAsset, borrowPortion, INSTITUTIONAL_BORROW_INTEREST);
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
		protocolFees.add(feeAsset, amount, METRIC.PROTOCOL_FEES);
	}

	const restakerFeesLogs = await options.getLogs({
		target: infra.delegation.address,
		eventAbi: capABI.Delegation.DistributeReward,
	});
	const restakerFees = options.createBalances();
	for (const log of restakerFeesLogs) {
		restakerFees.add(log.asset, log.amount, METRIC.STAKING_REWARDS);
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

	const capUsdMintFees = await addTokensReceived({
		options,
		fromAddressFilter: ADDRESSES.null,
		token: capConfig[options.chain].tokens.cUSD.address,
		target: capConfig[options.chain].feeRecipient,
	});

	const dailyFees = options.createBalances();
	dailyFees.addBalances(minterFees);
	dailyFees.addBalances(protocolFees, METRIC.PROTOCOL_FEES);
	dailyFees.addBalances(restakerFees, METRIC.STAKING_REWARDS);
	dailyFees.addBalances(insuranceFundFees, 'Insurance Fund Fees');
	dailyFees.addBalances(capUsdMintFees, METRIC.MINT_REDEEM_FEES);

	const dailyRevenue = options.createBalances();
	dailyRevenue.addBalances(protocolFees, METRIC.PROTOCOL_FEES);
dailyRevenue.addBalances(capUsdMintFees, METRIC.MINT_REDEEM_FEES);
	
	const dailySupplySideRevenue = options.createBalances();
	dailySupplySideRevenue.addBalances(minterFees);
	dailySupplySideRevenue.addBalances(restakerFees, METRIC.STAKING_REWARDS);
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
	Revenue: "Share of borrow fees for protocol and 0.1% of mint amount paid as fees for cUSD.",
	SupplySideRevenue: "Borrow fees distributed to stakers and restaker fees are distributed to delegators.",
	ProtocolRevenue: "Share of borrow fees for protocol and 0.1% of mint amount paid as fees for cUSD.",
};

const breakdownMethodology = {
	Fees: {
		[YIELD_FROM_DEFI]: "Yield earned on idle reserve funds deployed to external DeFi protocols (Aave/Morpho etc.).",
		[INSTITUTIONAL_BORROW_INTEREST]: "Interest paid by institutional borrowers (agents) on funds borrowed from the vault.",
		[METRIC.PROTOCOL_FEES]: "Protocol share of borrow fees.",
		[METRIC.STAKING_REWARDS]: "Restaker fees distributed to delegators.",
		'Insurance Fund Fees': "Fees allocated to insurance funds from minting.",
		[METRIC.MINT_REDEEM_FEES]: "0.1% of mint amount paid as fees for cUSD.",
	},
	Revenue: {
		[METRIC.PROTOCOL_FEES]: "Protocol share of borrow fees.",
		[METRIC.MINT_REDEEM_FEES]: "0.1% of mint amount paid as fees for cUSD.",
	},
	SupplySideRevenue: {
		[YIELD_FROM_DEFI]: "Yield earned on idle reserve funds deployed to external DeFi protocols (Aave/Morpho etc.).",
		[INSTITUTIONAL_BORROW_INTEREST]: "Interest paid by institutional borrowers (agents) on funds borrowed from the vault.",
		[METRIC.STAKING_REWARDS]: "Restaker fees distributed to delegators.",
	  'Insurance Fund Fees': "Fees allocated to insurance funds from minting.",
	},
};

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	fetch,
	chains: [CHAIN.ETHEREUM],
	start: capConfig[CHAIN.ETHEREUM].fromDate,
	methodology,
	breakdownMethodology,
};

export default adapter;
