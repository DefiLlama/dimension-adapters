import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const rEthVault = "0x936faCdf10c8c36294e7b9d28345255539d81bc7";
const rEthToken = "0xae78736Cd615f374D3085123A210448E74Fc6393";
const feeRegistry = "0x6dA4D1859bA1d02D095D2246142CdAd52233e27C";

const Abis = {
    convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',
    feeRates: 'function feeRates() view returns (uint256 managementRate, uint256 performanceRate)',
    protocolRate: 'function protocolRate(address vault) view returns (uint256 rate)',
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const [balance, feeRates, protocolRate] = await Promise.all([
        options.api.call({ target: rEthVault, abi: 'uint256:totalAssets' }),
        options.api.call({ target: rEthVault, abi: Abis.feeRates }),
        options.api.call({ target: feeRegistry, abi: Abis.protocolRate, params: [rEthVault] })
    ]);

    const [indexBefore, indexAfter] = await Promise.all([
        options.fromApi.call({ target: rEthVault, abi: Abis.convertToAssets, params: [String(1e18)] }),
        options.toApi.call({ target: rEthVault, abi: Abis.convertToAssets, params: [String(1e18)] })
    ]);

    const cumulativeYield = (BigInt(indexAfter) - BigInt(indexBefore)) * BigInt(balance) / BigInt(1e18);

    const managementFeeRate = Number(feeRates.managementRate) / 1e4;
    const performanceFeeRate = Number(feeRates.performanceRate) / 1e4;
    const protocolFeeRate = Number(protocolRate) / 1e4;

    const performanceFees = Number(cumulativeYield) * performanceFeeRate;

    const oneYear = 365 * 24 * 3600;
    const timeframe = options.toTimestamp - options.fromTimestamp;
    const managementFees = Number(balance) * managementFeeRate * timeframe / oneYear;

    const supplySideYield = Number(cumulativeYield) - performanceFees;
    
    const protocolPerformanceFees = performanceFees * protocolFeeRate
    const protocolManagementFees = managementFees * protocolFeeRate
    const curatorsFees = (performanceFees * (1- protocolFeeRate)) + (managementFees * (1- protocolFeeRate))

    dailyFees.add(rEthToken, supplySideYield, METRIC.ASSETS_YIELDS);
    dailyFees.add(rEthToken, protocolPerformanceFees, METRIC.PERFORMANCE_FEES);
    dailyFees.add(rEthToken, protocolManagementFees, METRIC.MANAGEMENT_FEES);
    dailyFees.add(rEthToken, curatorsFees, METRIC.CURATORS_FEES);

    dailySupplySideRevenue.add(rEthToken, supplySideYield, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(rEthToken, curatorsFees, METRIC.CURATORS_FEES);

    dailyRevenue.add(rEthToken, protocolPerformanceFees, METRIC.PERFORMANCE_FEES);
    dailyRevenue.add(rEthToken, protocolManagementFees, METRIC.MANAGEMENT_FEES);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: "2025-08-28",
        }
    },
    methodology: {
        Fees: "Total yield generated from rock.rETH vault.",
        Revenue: "Portion of 10% performance fee and 1% annual management fee to Rocksolid protocol.",
        ProtocolRevenue: "Portion of 10% performance fee and 1% annual management fee to Rocksolid protocol.",
        SupplySideRevenue: "Vault yield distributed to suppliers + curators.",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.ASSETS_YIELDS]: "Yield generated from supplied assets in the rock.rETH vault.",
            [METRIC.PERFORMANCE_FEES]: "Portion of collected from performance fees to Rocksolid protocol.",
            [METRIC.MANAGEMENT_FEES]: "Portion of collected from management fees to Rocksolid protocol.",
            [METRIC.CURATORS_FEES]: 'Share of performance and management fees to vault deployers/curators.',
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
            [METRIC.CURATORS_FEES]: 'Share of performance and management fees to vault deployers/curators.',
        }
    }
}

export default adapter;