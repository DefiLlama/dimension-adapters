import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";
import { METRIC } from "../../helpers/metrics";

const CONCRETE_API_URL = "https://apy.api.concrete.xyz/v1";

const CHAIN_CONFIG: Record<string, Record<string, string>> = {
    [CHAIN.ETHEREUM]: { chainId: '1', start: '2025-02-11' },
    [CHAIN.ARBITRUM]: { chainId: '42161', start: '2025-08-15' },
    [CHAIN.BERACHAIN]: { chainId: '80094', start: '2025-04-22' },
    [CHAIN.KATANA]: { chainId: '747474', start: '2025-07-29' },
    [CHAIN.STABLE]: { chainId: '988', start: '2025-12-09' },
};

const CONCRETE_ABIs = {
    totalSupply: 'uint256:totalSupply',
    convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
    highWaterMark: 'uint256:highWaterMark',
    vaultFee: 'function getVaultFees() view returns (tuple(uint64 depositFee,uint64 withdrawalFee,uint64 protocolFee,tuple(uint256 lowerBound,uint256 upperBound,uint64 fee)[] performanceFee))',
    feeConfig: 'function getFeeConfig() view returns(uint16 currentManagementFee,address currentManagementFeeRecipient, uint32 currentLastManagementFeeAccrual, uint16 currentPerformanceFee, address currentPerformanceFeeRecipient)',
    paused: 'bool:paused'
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const currentChainId = CHAIN_CONFIG[options.chain].chainId;
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const vaultsResponse = await getConfig('concrete', `${CONCRETE_API_URL}/vault:tvl/all`);

    const v1Vaults = new Set(Object.values(vaultsResponse[currentChainId]).filter((vault: any) => vault.version === 1 && +vault.peak_tvl > 10000).map((v1Vault: any) => v1Vault.address));

    const v2Vaults = new Set(Object.values(vaultsResponse[currentChainId]).filter((vault: any) => vault.version === 2 && +vault.peak_tvl > 10000).map((v1Vault: any) => v1Vault.address));

    const vaultsList = [...v1Vaults, ...v2Vaults];

    const vaultsAdditionalInfo = await getConfig('concrete-additional', `${CONCRETE_API_URL}/vault:performance/all`);

    const vaultDetails = Object.values(vaultsAdditionalInfo[currentChainId]).filter((vault: any) => vaultsList.includes(vault.address)).map((vault: any) => ({
        address: vault.address,
        underlyingAsset: vault.underlying_token_address,
        vaultDecimals: vault.decimals
    }));

    const vaultDecimalsMap = new Map(vaultDetails.map(vault => [vault.address, vault.vaultDecimals]));

    const totalSupplies = await options.api.multiCall({
        calls: vaultsList,
        abi: CONCRETE_ABIs.totalSupply,
        permitFailure: true,
    });

    const priceBefore = await options.fromApi.multiCall({
        abi: CONCRETE_ABIs.convertToAssets,
        calls: vaultsList.map(vault => ({
            target: vault,
            params: ['1' + '0'.repeat(vaultDecimalsMap.get(vault))]
        })),
        permitFailure: true
    });

    const priceAfter = await options.toApi.multiCall({
        abi: CONCRETE_ABIs.convertToAssets,
        calls: vaultsList.map(vault => ({
            target: vault,
            params: ['1' + '0'.repeat(vaultDecimalsMap.get(vault))]
        })),
        permitFailure: true
    });

    const highWaterMarks = await options.api.multiCall({
        abi: CONCRETE_ABIs.highWaterMark,
        calls: [...v1Vaults],
        permitFailure: true
    });

    const vaultFee = await options.api.multiCall({
        abi: CONCRETE_ABIs.vaultFee,
        calls: [...v1Vaults],
        permitFailure: true
    });

    const feeConfigs = await options.api.multiCall({
        calls: [...v2Vaults],
        abi: CONCRETE_ABIs.feeConfig,
        permitFailure: true
    });

    const isPaused = await options.api.multiCall({
        calls: [...v1Vaults],
        abi: CONCRETE_ABIs.paused,
        permitFailure: true
    });

    for (const [index, vaultAddress] of vaultsList.entries()) {
        const vaultVersion = v1Vaults.has(vaultsList[index]) ? 1 : 2;

        if (priceAfter[index] === null || priceBefore[index] === null || (vaultVersion === 1 && isPaused[index])) continue;
        const { underlyingAsset, vaultDecimals } = vaultDetails.find(vault => vault.address === vaultAddress)!;

        const v2Index = index - v1Vaults.size;

        //Decimals are upto 27 so using BigInt
        const priceDiff = BigInt(priceAfter[index]) - BigInt(priceBefore[index]);
        const yieldForPeriod = (priceDiff * BigInt(totalSupplies[index])) / (BigInt(10) ** BigInt(vaultDecimals));

        dailyFees.add(underlyingAsset, yieldForPeriod, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(underlyingAsset, yieldForPeriod, METRIC.ASSETS_YIELDS);

        const managementFeeInBps = vaultVersion === 1 ? vaultFee[index].protocolFee : feeConfigs[v2Index].currentManagementFee;
        const managementFees = (BigInt(managementFeeInBps)) * (BigInt(totalSupplies[index])) * BigInt(priceAfter[index]) * BigInt(options.toTimestamp - options.fromTimestamp) / (365n * 24n * 60n * 60n * 100n * 100n * (BigInt(10) ** BigInt(vaultDecimals)));

        dailyFees.add(underlyingAsset, managementFees, METRIC.MANAGEMENT_FEES);
        dailyRevenue.add(underlyingAsset, managementFees, METRIC.MANAGEMENT_FEES);

        let performanceFeeInBps = 0;
        if (vaultVersion === 1) {
            const priceInAssets = BigInt(priceAfter[index]) / (BigInt(10) ** BigInt(9));//decimal difference bw vault and asset is always 9

            if (priceInAssets <= highWaterMarks[index] || vaultFee[index].performanceFee.length === 0) continue;
            const performanceInBps = ((priceInAssets - BigInt(highWaterMarks[index]) * 100n) / BigInt(highWaterMarks[index]));

            for (const entry of vaultFee[index].performanceFee) {
                if (performanceInBps <= 0) continue;
                if (entry.lowerBound <= performanceInBps && entry.upperBound > performanceInBps) {
                    performanceFeeInBps = entry.fee;
                    break;
                }
            }
        }
        else {
            performanceFeeInBps = feeConfigs[v2Index].currentPerformanceFee;
        }
        const performanceFees = priceDiff > 0n ? (BigInt(performanceFeeInBps) * (priceDiff)) / (100n * 100n) : 0n;

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
    Revenue: "Protocol fees and performance fees",
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
        [METRIC.PERFORMANCE_FEES]: 'The performance fee is calculated as a percentage of the profit (asset value increase) since the last high water mark update.',
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
    breakdownMethodology,
    adapter: CHAIN_CONFIG,
    allowNegativeValue: true,
};

export default adapter;