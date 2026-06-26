import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const chainConfig: any = {
  [CHAIN.ETHEREUM]: {
    start: '2025-08-28',
    vaults: [
      {
        address: '0x936faCdf10c8c36294e7b9d28345255539d81bc7', // rock.rETH
        asset: '0xae78736Cd615f374D3085123A210448E74Fc6393',
      },
      {
        address: '0x7a12D4B719F5aA479eCD60dEfED909fb2A37e428', // rock.rLETH
        asset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      },
      {
        address: '0xba71097e426983d840569edfa1a01396b56d86ad', // rock.rUSDM
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      },
    ],
  },
}

const feeRegistry = "0x6dA4D1859bA1d02D095D2246142CdAd52233e27C";

const Abis = {
    convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',
    feeRates: 'function feeRates() view returns (uint256 managementRate, uint256 performanceRate)',
    protocolRate: 'function protocolRate(address vault) view returns (uint256 rate)',
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const { vaults } = chainConfig[options.chain];
    const vaultAddresses = vaults.map((vault: { address: string }) => vault.address);
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const [balances, feeRates, protocolRates] = await Promise.all([
        options.api.multiCall({ calls: vaultAddresses, abi: 'uint256:totalAssets', permitFailure: true }),
        options.api.multiCall({ calls: vaultAddresses, abi: Abis.feeRates, permitFailure: true }),
        options.api.multiCall({ calls: vaultAddresses.map((vault: string) => ({ target: feeRegistry, params: [vault] })), abi: Abis.protocolRate, permitFailure: true })
    ]);

    const convertCalls = vaultAddresses.map((vault: string) => ({ target: vault, params: [String(1e18)] }));
    const [indexesBefore, indexesAfter] = await Promise.all([
        options.fromApi.multiCall({ calls: convertCalls, abi: Abis.convertToAssets, permitFailure: true }),
        options.toApi.multiCall({ calls: convertCalls, abi: Abis.convertToAssets, permitFailure: true })
    ]);

    vaults.forEach(({ asset }: { asset: string }, i: number) => {
        const balance = balances[i];
        const feeRate = feeRates[i];
        const protocolRate = protocolRates[i];
        const indexBefore = indexesBefore[i];
        const indexAfter = indexesAfter[i];

        if (!balance || !feeRate || !protocolRate || !indexBefore || !indexAfter) return;

        const cumulativeYield = (BigInt(indexAfter) - BigInt(indexBefore)) * BigInt(balance) / BigInt(1e18);

        const managementFeeRate = Number(feeRate.managementRate) / 1e4;
        const performanceFeeRate = Number(feeRate.performanceRate) / 1e4;
        const protocolFeeRate = Number(protocolRate) / 1e4;

        const performanceFees = Number(cumulativeYield) * performanceFeeRate;

        const oneYear = 365 * 24 * 3600;
        const timeframe = options.toTimestamp - options.fromTimestamp;
        const managementFees = Number(balance) * managementFeeRate * timeframe / oneYear;

        const supplySideYield = Number(cumulativeYield) - performanceFees;
        
        const protocolPerformanceFees = performanceFees * protocolFeeRate
        const protocolManagementFees = managementFees * protocolFeeRate
        const curatorsFees = (performanceFees * (1- protocolFeeRate)) + (managementFees * (1- protocolFeeRate))

        dailyFees.add(asset, supplySideYield, METRIC.ASSETS_YIELDS);
        dailyFees.add(asset, protocolPerformanceFees, METRIC.PERFORMANCE_FEES);
        dailyFees.add(asset, protocolManagementFees, METRIC.MANAGEMENT_FEES);
        dailyFees.add(asset, curatorsFees, METRIC.CURATORS_FEES);

        dailySupplySideRevenue.add(asset, supplySideYield, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(asset, curatorsFees, METRIC.CURATORS_FEES);

        dailyRevenue.add(asset, protocolPerformanceFees, METRIC.PERFORMANCE_FEES);
        dailyRevenue.add(asset, protocolManagementFees, METRIC.MANAGEMENT_FEES);
    });

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
}

const methodology = {
    Fees: "Total yield generated from Rocksolid vaults.",
    Revenue: "Portion of 10% performance fee and 1% annual management fee to Rocksolid protocol.",
    ProtocolRevenue: "Portion of 10% performance fee and 1% annual management fee to Rocksolid protocol.",
    SupplySideRevenue: "Vault yield distributed to suppliers + curators.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Yield generated from supplied assets in Rocksolid vaults.",
        [METRIC.PERFORMANCE_FEES]: "Portion of collected from performance fees to Rocksolid protocol.",
        [METRIC.MANAGEMENT_FEES]: "Portion of collected from management fees to Rocksolid protocol.",
        [METRIC.CURATORS_FEES]: "Share of performance and management fees to vault deployers/curators.",
    },
    Revenue: {
        [METRIC.PERFORMANCE_FEES]: "Portion of collected from performance fees to Rocksolid protocol.",
        [METRIC.MANAGEMENT_FEES]: "Portion of collected from management fees to Rocksolid protocol.",
    },
    ProtocolRevenue: {
        [METRIC.PERFORMANCE_FEES]: "Portion of collected from performance fees to Rocksolid protocol.",
        [METRIC.MANAGEMENT_FEES]: "Portion of collected from management fees to Rocksolid protocol.",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Vault yield distributed to suppliers.",
        [METRIC.CURATORS_FEES]: "Share of performance and management fees to vault deployers/curators.",
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    adapter: chainConfig,
    methodology,
    breakdownMethodology,
    pullHourly: true,
}

export default adapter;
