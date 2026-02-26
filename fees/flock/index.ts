import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FLOCK_TOKEN = "0x5ab3d4c385b400f3abb49e80de2faf6a88a7b691";

const FACTORY_ADDRESS = "0x5c415570e4A9C49e64Ea640180f91161b47a1502";
const MAIN_CONTRACT = "0x29d4ecea4b1fcac239bf4b4dc3b42829c2e69fed";
const DEPLOYMENT_BLOCK = 30563420;

const FOMO_CONTRACT = "0x6f39Fe20f19103A215BcC444A64f78AE7797F0b1";
const FOMO_DEPLOYMENT_BLOCK = 40119273;

// Main contract events
const CREATE_MINI_POOL_EVENT = "event CreateMiniPool(address indexed user, address pool, uint256 sigma)";
const COLLECT_FEE_EVENT = "event CollectFee(address indexed _delegator, uint256 _amount)";

// Fomo contract events
const PURCHASED_EVENT = "event Purchased(address indexed token, address indexed buyer, uint256 flockIn, uint256 netUsed, uint256 mtAllocated, uint256 protocolFee, uint256 creatorFee, uint256 antiSniperFee)";
const LAUNCH_CREATED_EVENT = "event LaunchCreated(address indexed token, address indexed creator, bytes32 indexed modelTypeId, uint256 targetRaiseMin, uint256 targetRaiseMax, uint256 targetSale, uint64 saleStart, uint64 saleEnd, string mtName, string mtSymbol, bool isBundled)";
const FEE_CONFIG_UPDATED_EVENT = "event FeeConfigUpdated(address feeRecipient, uint16 baseFeeBps, uint16 creatorFeeBps, uint256 launchCreationFee, uint16 antiSniperTaxStartValue, uint16 maxBundleBps)";

const fetch = async (options: FetchOptions) => {
    const { getLogs, createBalances } = options;
    const dailyFees = createBalances();

    // Get pool addresses
    const poolCreationLogs = await getLogs({
        target: FACTORY_ADDRESS,
        eventAbi: CREATE_MINI_POOL_EVENT,
        fromBlock: DEPLOYMENT_BLOCK,
        cacheInCloud: true,
    });

    const pools = poolCreationLogs.map((log) => log.pool);

    const mainContractAndPoolsFees = await getLogs({
        targets: [MAIN_CONTRACT, ...pools],
        eventAbi: COLLECT_FEE_EVENT,
    });

    // Get Purchased events from launchpad (protocolFee + creatorFee + antiSniperFee)
    const purchasedLogs = await getLogs({
        target: FOMO_CONTRACT,
        eventAbi: PURCHASED_EVENT,
    });

    // Get LaunchCreated events from launchpad
    const launchCreatedLogs = await getLogs({
        target: FOMO_CONTRACT,
        eventAbi: LAUNCH_CREATED_EVENT,
    });

    // Get FeeConfigUpdated events to determine launch creation fee
    const feeConfigLogs = await getLogs({
        target: FOMO_CONTRACT,
        eventAbi: FEE_CONFIG_UPDATED_EVENT,
        fromBlock: FOMO_DEPLOYMENT_BLOCK,
        cacheInCloud: true,
    });

    // Get the latest launch creation fee (use last config event, or default to 32768 FLOCK)
    const launchCreationFee = feeConfigLogs.length > 0
        ? feeConfigLogs[feeConfigLogs.length - 1].launchCreationFee
        : BigInt(32768) * BigInt(10 ** 18);

    mainContractAndPoolsFees.forEach((log) => {
        dailyFees.add(FLOCK_TOKEN, log._amount, "Main and Pools Fees");
    });

    purchasedLogs.forEach((log) => {
        dailyFees.add(FLOCK_TOKEN, log.protocolFee, METRIC.PROTOCOL_FEES);
        dailyFees.add(FLOCK_TOKEN, log.creatorFee, METRIC.CREATOR_FEES);
        dailyFees.add(FLOCK_TOKEN, log.antiSniperFee, "Anti Sniper Fee");
    });

    const launchCount = launchCreatedLogs.length;
    if (launchCount > 0) {
        dailyFees.add(FLOCK_TOKEN, BigInt(launchCreationFee) * BigInt(launchCount), "Launch Creation Fee");
    }

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Fees: "All FLOCK token fees collected via CollectFee events from the main contract and MiniPools, plus protocol/creator/antiSniper fees from Purchased events and launch creation fees (from FeeConfigUpdated) per LaunchCreated event.",
    Revenue: "All FLOCK token fees collected by the protocol.",
    ProtocolRevenue: "All FLOCK token fees collected by the protocol.",
};

const breakdownMethodology = {
    Fees: {
        "Main and Pools Fees": "Main and Pools fees collected by the protocol.",
        [METRIC.PROTOCOL_FEES]: "Protocol fees collected by the protocol.",
        [METRIC.CREATOR_FEES]: "Creator fees collected by the protocol.",
        "Anti Sniper Fee": "Anti sniper fees collected by the protocol.",
        "Launch Creation Fee": "Launch creation fees collected by the protocol.",
    },
    Revenue: {
        "Main and Pools Fees": "Main and Pools fees collected by the protocol.",
        [METRIC.PROTOCOL_FEES]: "Protocol fees collected by the protocol.",
        [METRIC.CREATOR_FEES]: "Creator fees collected by the protocol.",
        "Anti Sniper Fee": "Anti sniper fees collected by the protocol.",
        "Launch Creation Fee": "Launch creation fees collected by the protocol.",
    },
    ProtocolRevenue: {
        "Main and Pools Fees": "Main and Pools fees collected by the protocol.",
        [METRIC.PROTOCOL_FEES]: "Protocol fees collected by the protocol.",
        [METRIC.CREATOR_FEES]: "Creator fees collected by the protocol.",
        "Anti Sniper Fee": "Anti sniper fees collected by the protocol.",
        "Launch Creation Fee": "Launch creation fees collected by the protocol.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    chains: [CHAIN.BASE],
    start: "2024-12-31",
    fetch,
    methodology,
    breakdownMethodology,
};

export default adapter;
