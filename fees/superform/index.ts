import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const SUPERVAULT_AGGREGATOR = "0x10AC0b33e1C4501CF3ec1cB1AE51ebfdbd2d4698";

const GET_SUPERVAULT_STRATEGIES_ABI = "function getAllSuperVaultStrategies() view returns (address[])";
const GET_VAULT_INFO_ABI = "function getVaultInfo() view returns (address vault, address asset, uint8 vaultDecimals)";

const MANAGEMENT_FEE_EVENT = "event ManagementFeePaid(address indexed controller, address indexed recipient, uint256 feeAssets, uint256 feeBps)";
const PERFORMANCE_FEE_EVENT = "event PerformanceFeeSkimmed(uint256 totalFee, uint256 superformFee)";
const HWMPPS_UPDATE_EVENT = "event HWMPPSUpdated(uint256 newHwmPps, uint256 previousPps, uint256 profit, uint256 feeCollected)";

const fetch = async (options: FetchOptions) => {
    const { getLogs, createBalances, api } = options;
    const dailyFees = createBalances();
    const dailyUserFees = createBalances();
    const dailySupplySideRevenue = createBalances();
    const dailyRevenue = createBalances();
    const dailyHoldersRevenue = createBalances();
    const dailyProtocolRevenue = createBalances();

    const strategies: string[] = await api.call({ 
        abi: GET_SUPERVAULT_STRATEGIES_ABI, 
        target: SUPERVAULT_AGGREGATOR 
    });

    const vaultInfo = await api.multiCall({
      abi: GET_VAULT_INFO_ABI,
      calls: strategies.map(strat => ({ target: strat }))
    });

    const strategyMap = Object.fromEntries(
        strategies.map((s, i) => [s.toLowerCase(), vaultInfo[i].asset.toLowerCase()])
    );
    
    const performanceFeeLogs = await getLogs({
        targets: Object.keys(strategyMap),
        eventAbi: PERFORMANCE_FEE_EVENT,
        entireLog: true,
    });

    const updateLogs = await getLogs({
        targets: Object.keys(strategyMap),
        eventAbi: HWMPPS_UPDATE_EVENT,
        entireLog: true,
    });

    if (performanceFeeLogs.length === 0 || updateLogs.length === 0) {
        return { 
            dailyFees, 
            dailyUserFees,
            dailySupplySideRevenue,
            dailyRevenue,
            dailyHoldersRevenue, 
            dailyProtocolRevenue,  
        };
    };

    const combinedLogs: { 
        strategy: string, 
        totalFee: bigint, 
        superformFee: bigint, 
        profit: bigint 
    }[] = [];

    for (const perfLog of performanceFeeLogs) {
        const updateLog = updateLogs.find((log) => log.transactionHash.toLowerCase() === perfLog.transactionHash.toLowerCase());
        if (!updateLog) continue;
        combinedLogs.push({
            strategy: updateLog.address,
            totalFee: perfLog.args.totalFee,
            superformFee: perfLog.args.superformFee,
            profit: updateLog.args.profit
        });
    };

    for (const log of combinedLogs) {
        const underlying = strategyMap[log.strategy.toLowerCase()];
        if (!underlying) continue;
        dailyFees.add(underlying, log.profit, METRIC.ASSETS_YIELDS);
        dailyUserFees.add(underlying, log.totalFee, METRIC.PERFORMANCE_FEES);
        dailySupplySideRevenue.add(underlying, log.profit - log.totalFee, METRIC.ASSETS_YIELDS);
        dailyRevenue.add(underlying, log.superformFee, METRIC.PERFORMANCE_FEES);
        if (options.endTimestamp >= 1771472040) {
            dailyHoldersRevenue.add(underlying, log.superformFee * 2n / 10n, METRIC.PERFORMANCE_FEES);
            dailyProtocolRevenue.add(underlying, log.superformFee * 8n / 10n, METRIC.PERFORMANCE_FEES);
        } else {
            dailyProtocolRevenue.add(underlying, log.superformFee, METRIC.PERFORMANCE_FEES);
        };
    };

    const managementFeeLogs = await getLogs({
        targets: Object.keys(strategyMap),
        eventAbi: MANAGEMENT_FEE_EVENT,
        entireLog: true,
    });

    for (const manageLogs of managementFeeLogs) {
        const underlying = strategyMap[manageLogs.address.toLowerCase()];
        if (!underlying) continue;
        dailyFees.add(underlying, manageLogs.feeAssets, METRIC.MANAGEMENT_FEES);
        dailyUserFees.add(underlying, manageLogs.feeAssets, METRIC.MANAGEMENT_FEES);
        dailyRevenue.add(underlying, manageLogs.feeAssets, METRIC.MANAGEMENT_FEES);
        if (options.endTimestamp >= 1771472040) {
            dailyHoldersRevenue.add(underlying, manageLogs.feeAssets * 2n / 10n, METRIC.MANAGEMENT_FEES);
            dailyProtocolRevenue.add(underlying, manageLogs.feeAssets * 8n / 10n, METRIC.MANAGEMENT_FEES);
        } else {
            dailyProtocolRevenue.add(underlying, manageLogs.feeAssets, METRIC.MANAGEMENT_FEES);
        };
    };

    return { 
        dailyFees, 
        dailyUserFees,
        dailySupplySideRevenue,
        dailyRevenue,
        dailyHoldersRevenue, 
        dailyProtocolRevenue,  
    };
};

const methodology = {
    Fees: "Total yield from deposited assets across all SuperVaults.",
    UserFees: "Performance and management fees paid by SuperVault depositors.",
    SupplySideRevenue: "Yield distributed to SuperVault depositors after protocol fees.",
    Revenue: "Performance and management fees collected by Superform.",
    HoldersRevenue: "20% of protocol fees routed to sUP vault stakers.",
    ProtocolRevenue: "80% of protocol fees routed to the Superform Foundation treasury."
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: 'Total yield generated by deposited assets across all SuperVaults.',
        [METRIC.PERFORMANCE_FEES]: 'Performance fees charged on vault profits.',
        [METRIC.MANAGEMENT_FEES]: 'Management fees charged on deposits.',
    },
    UserFees: {
        [METRIC.PERFORMANCE_FEES]: 'Performance fees paid by depositors on vault profits.',
        [METRIC.MANAGEMENT_FEES]: 'Management fees paid by depositors at deposit time.',
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: 'Yield distributed to SuperVault depositors after fees.',
    },
    Revenue: {
        [METRIC.PERFORMANCE_FEES]: 'Performance fees collected by Superform.',
        [METRIC.MANAGEMENT_FEES]: 'Management fees collected by Superform.',
    },
    HoldersRevenue: {
        [METRIC.PERFORMANCE_FEES]: '20% of performance fees routed to sUP vault stakers.',
        [METRIC.MANAGEMENT_FEES]: '20% of management fees routed to sUP vault stakers.',
    },
    ProtocolRevenue: {
        [METRIC.PERFORMANCE_FEES]: '80% of performance fees routed to Superform Foundation treasury.',
        [METRIC.MANAGEMENT_FEES]: '80% of management fees routed to Superform Foundation treasury.',
    },
};


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.BASE],
  start: '2025-12-03'
};


export default adapter;