import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const SUPERVAULT_AGGREGATOR = "0x10AC0b33e1C4501CF3ec1cB1AE51ebfdbd2d4698";
const SUPERBANK = "0x6fCc6a6A825FC14e6e56Fd14978FC6B97ACB5d15";

const GET_SUPERVAULT_STRATEGIES_ABI = "function getAllSuperVaultStrategies() view returns (address[])";
const GET_VAULT_INFO_ABI = "function getVaultInfo() view returns (address vault, address asset, uint8 vaultDecimals)";

const PERFORMANCE_FEE_EVENT = "event PerformanceFeeSkimmed(uint256 totalFee, uint256 superformFee)";
const HWMPPS_UPDATE_EVENT = "event HWMPPSUpdated(uint256 newHwmPps, uint256 previousPps, uint256 profit, uint256 feeCollected)";
const MANAGEMENT_FEE_EVENT = "event ManagementFeePaid(address indexed controller, address indexed recipient, uint256 feeAssets, uint256 feeBps)";
const REVENUE_DISTRIBUTED_EVENT = "event RevenueDistributed(address indexed upToken, address indexed supStrategyVault, address indexed treasury, uint256 supAmount, uint256 treasuryAmount)";

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
        target: SUPERVAULT_AGGREGATOR,
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
        onlyArgs: false,
    });

    const updateLogs = await getLogs({
        targets: Object.keys(strategyMap),
        eventAbi: HWMPPS_UPDATE_EVENT,
        onlyArgs: false,
    });

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
        dailySupplySideRevenue.add(underlying, log.totalFee - log.superformFee, METRIC.CURATORS_FEES);
        dailyRevenue.add(underlying, log.superformFee, METRIC.PERFORMANCE_FEES);
    };

    const managementFeeLogs = await getLogs({
        targets: Object.keys(strategyMap),
        eventAbi: MANAGEMENT_FEE_EVENT,
        onlyArgs: false,
    });

    for (const manageLogs of managementFeeLogs) {
        const underlying = strategyMap[manageLogs.address.toLowerCase()];
        if (!underlying) continue;
        dailyFees.add(underlying, manageLogs.args.feeAssets, METRIC.MANAGEMENT_FEES);
        dailyUserFees.add(underlying, manageLogs.args.feeAssets, METRIC.MANAGEMENT_FEES);
        if (manageLogs.args.recipient.toLowerCase() === SUPERBANK.toLowerCase()) {
            dailyRevenue.add(underlying, manageLogs.args.feeAssets, METRIC.MANAGEMENT_FEES);
        } else {
            dailySupplySideRevenue.add(underlying, manageLogs.args.feeAssets, METRIC.CURATORS_FEES);
        };
    };

    const revenueDistributionLogs = await getLogs({
        target: SUPERBANK,
        eventAbi: REVENUE_DISTRIBUTED_EVENT
    });

    for (const revShare of revenueDistributionLogs) {
        dailyHoldersRevenue.add(revShare.upToken, revShare.supAmount, "Protocol Fees To sUP Vault");
        dailyProtocolRevenue.add(revShare.upToken, revShare.treasuryAmount, "Protocol Fees To Treasury");
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
    SupplySideRevenue: "Yield distributed to SuperVault depositors and fees paid to vault curators.",
    Revenue: "Performance and management fees collected by Superform.",
    HoldersRevenue: "Protocol-collected fees, after conversion to $UP, routed to the sUP strategy vault per governance-configured distribution.",
    ProtocolRevenue: "Protocol-collected fees, after conversion to $UP, routed to the Superform Foundation treasury."
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Total yield generated by deposited assets across all SuperVaults.",
        [METRIC.MANAGEMENT_FEES]: "Management fees charged on deposits.",
    },
    UserFees: {
        [METRIC.PERFORMANCE_FEES]: "Performance fees paid by depositors on vault profits.",
        [METRIC.MANAGEMENT_FEES]: "Management fees paid by depositors at deposit time.",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yield distributed to SuperVault depositors after fees.",
        [METRIC.CURATORS_FEES]: "Management and performance fees distributed to vault strategy curators."
    },
    Revenue: {
        [METRIC.PERFORMANCE_FEES]: "Performance fees collected by Superform.",
        [METRIC.MANAGEMENT_FEES]: "Management fees collected by Superform.",
    },
    HoldersRevenue: {
        "Protocol Fees To sUP Vault": "Percentage of protocol fees converted to $UP and routed to the sUP strategy vault.",
    },
    ProtocolRevenue: {
        "Protocol Fees To Treasury": "Percentage of protocol fees converted to $UP and routed to the Superform Foundation treasury.",
    },
};


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: "2025-12-03",
    },
    [CHAIN.BASE]: {
      start: "2026-01-29",
    },
  }
};


export default adapter;