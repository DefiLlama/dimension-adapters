import { FetchOptions } from "../../adapters/types";
import { capABI, capConfig, devAddresses, vaultsSymbols } from "./config";

export const arrayZip = <A, B>(a: A[], b: B[]) => {
	const maxLength = Math.max(a.length, b.length);
	return Array.from({ length: maxLength }, (_, i) => [a[i], b[i]]) as [A, B][];
};

export const isKnownVault = (options: FetchOptions, vault: string) => {
	const vaults = vaultsSymbols.map(
		(symbol) => capConfig[options.chain].tokens[symbol],
	);
	return vaults.map((vault) => vault.address.toLowerCase()).includes(vault);
};

export const fetchAssetAddresses = async (
	options: FetchOptions,
	chain: string,
) => {
	const infra = capConfig[chain].infra;
	const tokens = capConfig[chain].tokens;
	const lender = infra.lender;

	const cUSDVaultAssetAddresses = await options.getLogs({
		eventAbi: capABI.Vault.AddAssetEvent,
		target: tokens.cUSD.address,
		fromBlock: tokens.cUSD.fromBlock,
		cacheInCloud: true,
	});

	const lenderReserveAssetAddresses = await options.getLogs({
		eventAbi: capABI.Lender.ReserveAssetAddedEvent,
		target: lender.address,
		fromBlock: lender.fromBlock,
		cacheInCloud: true,
	});

	return [
		...new Set([
			...cUSDVaultAssetAddresses.map((event) => event.asset.toLowerCase()),
			...lenderReserveAssetAddresses.map((event) => event.asset.toLowerCase()),
		]),
	];
};

export const fetchVaultConfigs = async (options: FetchOptions) => {
	const infra = capConfig[options.chain].infra;

	const assetAddedEvents = await options.getLogs({
		target: infra.lender.address,
		eventAbi: capABI.Lender.ReserveAssetAddedEvent,
		fromBlock: infra.lender.fromBlock,
		cacheInCloud: true,
	});

	const vaultConfigsByAsset: Record<
		string,
		{ asset: string; vault: string; interestReceivers: string[] }
	> = {};
	for (const event of assetAddedEvents) {
		const asset = event.asset.toLowerCase();
		const vault = event.vault.toLowerCase();
		if (!isKnownVault(options, vault)) {
			continue;
		}

		const interestReceiver = event.interestReceiver.toLowerCase();
		if (!vaultConfigsByAsset[asset]) {
			vaultConfigsByAsset[asset] = { asset, vault, interestReceivers: [] };
		} else if (vaultConfigsByAsset[asset].vault !== vault) {
			throw new Error(
				`Vault mismatch for asset ${asset}: ${vaultConfigsByAsset[asset].vault} !== ${vault}`,
			);
		}
		vaultConfigsByAsset[asset].interestReceivers.push(interestReceiver);
	}

	const interestReceiverUpdatedEvents = await options.getLogs({
		target: infra.lender.address,
		eventAbi: capABI.Lender.ReserveInterestReceiverUpdatedEvent,
		fromBlock: infra.lender.fromBlock,
		cacheInCloud: true,
	});
	for (const event of interestReceiverUpdatedEvents) {
		const asset = event.asset.toLowerCase();
		const interestReceiver = event.interestReceiver.toLowerCase();
		if (!vaultConfigsByAsset[asset]) {
			throw new Error(`Asset ${asset} not found in vaultConfigsByAsset`);
		}
		vaultConfigsByAsset[asset].interestReceivers.push(interestReceiver);
	}

	const vaultConfigs = Object.values(vaultConfigsByAsset);

	const insuranceFunds: string[] = (
		await options.api.batchCall(
			vaultConfigs.map(({ vault }) => ({
				target: vault,
				abi: capABI.Vault.insuranceFund,
			})),
		)
	).map((i) => i.toLowerCase());

	const result = arrayZip(vaultConfigs, insuranceFunds).map(
		([vaultConfig, insuranceFund]) => ({
			...vaultConfig,
			insuranceFund: devAddresses.includes(insuranceFund)
				? null
				: insuranceFund,
		}),
	);
	return result;
};
