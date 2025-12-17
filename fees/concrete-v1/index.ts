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
};

const CONCRETE_ABIs = {
    totalSupply: 'uint256:totalSupply',
    convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
    highWaterMark: 'uint256:highWaterMark',
    vaultFee: 'function getVaultFees() view returns (tuple(uint64 depositFee,uint64 withdrawalFee,uint64 protocolFee,tuple(uint256 lowerBound,uint256 upperBound,uint64 fee)[] performanceFee))'
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const currentChainId = CHAIN_CONFIG[options.chain].chainId;
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const vaultsResponse = await getConfig('concrete', `${CONCRETE_API_URL}/vault:tvl/all`);

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

    const highWaterMarks = await options.api.multiCall({
        abi: CONCRETE_ABIs.highWaterMark,
        calls: vaultsList,
        permitFailure: true
    });

    const vaultFee = await options.api.multiCall({
        abi: CONCRETE_ABIs.vaultFee,
        calls: vaultsList,
        permitFailure: true
    });

    for (const [index, { underlyingAsset, vaultDecimals }] of vaultDetails.entries()) {
        if (priceAfter[index] === null || priceBefore[index] === null) continue;
        //Decimals are upto 27 so using BigInt
        const priceDiff = BigInt(priceAfter[index]) - BigInt(priceBefore[index]) > 0n ? BigInt(priceAfter[index]) - BigInt(priceBefore[index]) : 0n;
        const yieldForPeriod = (priceDiff * BigInt(totalSupplies[index])) / (BigInt(10) ** BigInt(vaultDecimals));

        dailyFees.add(underlyingAsset, yieldForPeriod, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(underlyingAsset, yieldForPeriod, METRIC.ASSETS_YIELDS);

        const managementFeeInBps = vaultFee[index].protocolFee;
        const managementFees = (BigInt(managementFeeInBps) / (100n * 100n)) * (BigInt(totalSupplies[index]) / (BigInt(10) ** BigInt(vaultDecimals))) * BigInt(priceAfter[index]);

        dailyFees.add(underlyingAsset[index], managementFees, METRIC.MANAGEMENT_FEES);
        dailyRevenue.add(underlyingAsset[index], managementFees, METRIC.MANAGEMENT_FEES);

        const priceInAssets = BigInt(priceAfter[index]) / (BigInt(10) ** BigInt(9));

        if (priceInAssets <= highWaterMarks[index] || vaultFee[index].performanceFee.length === 0) continue;
        const performanceInBps = ((priceInAssets - BigInt(highWaterMarks[index])) / BigInt(highWaterMarks[index])) * 100n;

        let performanceFeeInBps = 0;
        for (const entry of vaultFee[index].performanceFee) {
            if (entry.lowerBound <= performanceInBps && entry.upperBound > performanceInBps) {
                performanceFeeInBps = entry.fee;
                break;
            }
        }
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
};

export default adapter;