import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";
import { METRIC } from "../../helpers/metrics";
import { nullAddress } from "../../helpers/token";

const CONCRETE_API_URL = "https://apy.api.concrete.xyz/v1";

const CHAIN_CONFIG: Record<string, Record<string, string>> = {
    [CHAIN.ETHEREUM]: { chainId: '1', startDate: '2025-02-11' },
    [CHAIN.ARBITRUM]: { chainId: '42161', startDate: '2025-08-15' },
    [CHAIN.BERACHAIN]: { chainId: '80094', startDate: '2025-04-22' },
    [CHAIN.KATANA]: { chainId: '747474', startDate: '2025-07-29' },
};

const CONCRETE_ABIs = {
    totalSupply: 'uint256:totalSupply',
    convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
    feeRecipient: 'address:feeRecipient',
    transfer: 'event Transfer (address indexed from,address indexed to, uint256 value)'
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const currentChainId = CHAIN_CONFIG[options.chain].chainId;
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const vaultsResponse = await getConfig('concrete', `${CONCRETE_API_URL}/vault:tvl/all`);

    const getPreviousValues = (abi: string, target: string[], params: string[] = []) => {
        const calls = params.length === 0 ? target : target.map((address, index) => ({ target: address, params: params[index] }));
        return options.fromApi.multiCall({
            abi,
            calls,
            permitFailure: true
        })
    };

    const getCurrentValues = (abi: string, target: string[], params: string[] = []) => {
        const calls = params.length === 0 ? target : target.map((address, index) => ({ target: address, params: params[index] }));
        return options.toApi.multiCall({
            abi,
            calls,
            permitFailure: true
        })
    };

    const vaults = new Set(Object.values(vaultsResponse[currentChainId]).filter((vault: any) => vault.version === 1 && +vault.peak_tvl > 0).map((v1Vault: any) => v1Vault.address));

    const vaultsAdditionalInfo = await getConfig('concrete-additional', `${CONCRETE_API_URL}/vault:performance/all`);

    const vaultDetails = Object.values(vaultsAdditionalInfo[currentChainId]).filter((vault: any) => vaults.has(vault.address)).map((vault: any) => ({
        address: vault.address,
        underlyingAsset: vault.underlying_token_address,
        vaultDecimals: vault.decimals
    }));
    const vaultsList = vaultDetails.map(vault => vault.address);

    const totalSupplies = await options.api.multiCall({
        calls: vaultsList,
        abi: CONCRETE_ABIs.totalSupply,
        permitFailure: true,
    });

    const priceBefore = await getPreviousValues(CONCRETE_ABIs.convertToAssets, vaultsList, vaultDetails.map(vault => '1' + '0'.repeat(vault.vaultDecimals)));

    const priceAfter = await getCurrentValues(CONCRETE_ABIs.convertToAssets, vaultsList, vaultDetails.map(vault => '1' + '0'.repeat(vault.vaultDecimals)));

    const feeRecipients = await options.api.multiCall({
        calls: vaultsList,
        abi: CONCRETE_ABIs.feeRecipient,
        permitFailure: true
    });

    const vaultTransferLogs = await options.getLogs({
        targets: vaultsList,
        eventAbi: CONCRETE_ABIs.transfer,
        flatten: false
    });

    for (const [index, { underlyingAsset, vaultDecimals }] of vaultDetails.entries()) {
        if (priceAfter[index] === null || priceBefore[index] === null) continue;
        //Decimals are upto 27 so using BigInt
        const priceDiff = BigInt(priceAfter[index]) - BigInt(priceBefore[index]) > 0n ? BigInt(priceAfter[index]) - BigInt(priceBefore[index]) : 0n;
        const yieldForPeriod = (priceDiff * BigInt(totalSupplies[index])) / (BigInt(10) ** BigInt(vaultDecimals));

        dailyFees.add(underlyingAsset, yieldForPeriod, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(underlyingAsset, yieldForPeriod, METRIC.ASSETS_YIELDS);

        const feeInVaultUnits = vaultTransferLogs[index].reduce((acc: bigint, { from, to, value }: { from: string, to: string, value: bigint }) => {
            if (from === nullAddress && to === feeRecipients[index]) acc += value;
            return acc
        }, 0n);

        const feeInAssets = (feeInVaultUnits / (BigInt(10) ** BigInt(vaultDecimals))) * BigInt(priceAfter[index]);
        dailyFees.add(underlyingAsset, feeInAssets);
        dailyRevenue.add(underlyingAsset.feeInAssets);
    }

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue,
    }
}

const methodology = {
    Fees: "Includes Vault yields, protocol fees and performance fees",
    Revenue: "Protocol fees and performance fees",
    SupplySideRevenue: "Vault yields recieved by vault depositors",
    ProtocolRevenue: "All the revenue goes to the protocol"
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    methodology,
    adapter: CHAIN_CONFIG,
};

export default adapter;