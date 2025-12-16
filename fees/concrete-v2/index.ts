import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";
import { METRIC } from "../../helpers/metrics";

const CONCRETE_API_URL = "https://apy.api.concrete.xyz/v1";

const CHAIN_CONFIG: Record<string, Record<string, string>> = {
    [CHAIN.ETHEREUM]: { chainId: '1', startDate: '2025-10-22' },
    [CHAIN.STABLE]: { chainId: '988', startDate: '2025-12-08' },
    [CHAIN.ARBITRUM]: { chainId: '42161', startDate: '2025-11-06' },
}

const CONCRETE_ABIs = {
    totalSupply: 'uint256:totalSupply',
    convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
    feeConfig: 'function getFeeConfig() view returns(uint16 currentManagementFee,address currentManagementFeeRecipient, uint32 currentLastManagementFeeAccrual, uint16 currentPerformanceFee, address currentPerformanceFeeRecipient)'
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const currentChainId = CHAIN_CONFIG[options.chain].chainId;
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const vaultsResponse = await getConfig('concrete', `${CONCRETE_API_URL}/vault:tvl/all`);

    const vaults = new Set(Object.values(vaultsResponse[currentChainId]).filter((vault: any) => vault.version === 2 && +vault.peak_tvl > 0).map((v2Vault: any) => v2Vault.address));

    const vaultsAdditionalInfo = await getConfig('concrete-additional', `${CONCRETE_API_URL}/vault:performance/all`);

    const vaultDetails = Object.values(vaultsAdditionalInfo[currentChainId]).filter((vault: any) => vaults.has(vault.address)).map((vault: any) => ({
        address: vault.address,
        underlyingAsset: vault.underlying_token_address,
        vaultDecimals: vault.decimals
    }));

    const vaultsList = vaultDetails.map(vault => vault.address);

    const totalSupplies = await options.api.multiCall({
        calls: vaultsList,
        abi: 'uint256:totalSupply',
        permitFailure: true,
    });

    const priceBefore = await options.fromApi.multiCall({
        abi: CONCRETE_ABIs.convertToAssets,
        calls: vaultDetails.map(vault => ({
            target: vault.address,
            params: ['1' + '0'.repeat(vault.vaultDecimals)]
        })),
        permitFailure: true
    });

    const priceAfter = await options.toApi.multiCall({
        abi: CONCRETE_ABIs.convertToAssets,
        calls: vaultDetails.map(vault => ({
            target: vault.address,
            params: ['1' + '0'.repeat(vault.vaultDecimals)]
        })),
        permitFailure: true
    });

    const feeConfigs = await options.api.multiCall({
        calls: vaultsList,
        abi: CONCRETE_ABIs.feeConfig,
        permitFailure: true
    });

    for (const [index, { vaultDecimals, underlyingAsset }] of vaultDetails.entries()) {
        if (priceAfter[index] === null || priceBefore[index] === null) continue;
        //Decimals are upto 27, so using BigInt
        const priceDiff = BigInt(priceAfter[index]) - BigInt(priceBefore[index]) > 0n ? BigInt(priceAfter[index]) - BigInt(priceBefore[index]) : 0n;
        const yieldForPeriod = (priceDiff * BigInt(totalSupplies[index])) / (BigInt(10) ** BigInt(vaultDecimals));

        dailyFees.add(underlyingAsset, yieldForPeriod, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(underlyingAsset, yieldForPeriod, METRIC.ASSETS_YIELDS);

        const managementFeeInBps = feeConfigs[index].currentManagementFee;
        const managementFees = (BigInt(managementFeeInBps) / (100n * 100n)) * (BigInt(totalSupplies[index]) / (BigInt(10) ** BigInt(vaultDecimals))) * BigInt(priceAfter[index]);

        dailyFees.add(underlyingAsset[index], managementFees, METRIC.MANAGEMENT_FEES);
        dailyRevenue.add(underlyingAsset[index], managementFees, METRIC.MANAGEMENT_FEES);

        const performanceFeeInBps = feeConfigs[index].currentPerformanceFee;
        const performanceFees = (BigInt(performanceFeeInBps) * (priceDiff)) / (100n * 100n);

        dailyFees.add(underlyingAsset, performanceFees, METRIC.PERFORMANCE_FEES);
        dailyRevenue.add(underlyingAsset, performanceFees, METRIC.PERFORMANCE_FEES);
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
    Revenue: "Management fees and performance fees",
    SupplySideRevenue: "Vault yields recieved by vault depositors",
    ProtocolRevenue: "All the revenue goes to the protocol"
};


const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: 'Vault yields recieved by vault depositors',
        [METRIC.PERFORMANCE_FEES]: 'The performance fee is calculated as a percentage of the profit (asset value increase) since the last high water mark update.',
        [METRIC.MANAGEMENT_FEES]: "The management fee is calculated as a percentage of the total assets, prorated over time since the last fee update.",
    },
    Revenue: {
        [METRIC.PERFORMANCE_FEES]: 'The performance fee is calculated as a percentage of the profit.',
        [METRIC.MANAGEMENT_FEES]: "The management fee is calculated as a percentage of the total assets, prorated over time since the last fee update.",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: 'Vault yields recieved by vault depositors',
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    methodology,
    adapter: CHAIN_CONFIG,
    breakdownMethodology
};

export default adapter;