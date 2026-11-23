import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";

const PERP_ADDRESS = "0x54A62D550e1754f3bB34ad80501A63815297Fccc";
const USDC_ADDRESS = ADDRESSES.arbitrum.USDC_CIRCLE;

const ABIS = {
    PositionOpened:
        "event PositionOpened(uint256 indexed positionId,address indexed trader,address indexed asset,bool isLong,uint256 size,uint256 collateral,uint256 entryPrice,uint256 tp,uint256 sl,uint256 openFee)",
    PositionClosed:
        "event PositionClosed(uint256 indexed positionId,address indexed trader,uint256 exitPrice,int256 pnl,uint256 closeFee,uint256 payoutToTrader)",
    PositionLiquidated:
        "event PositionLiquidated(uint256 indexed positionId,address indexed trader,uint256 price,int256 pnl,uint256 liquidationFee)",
    closedTrades:
        "function closedTrades(uint256) view returns (address trader,address asset,bool isLong,uint256 size,uint256 entryPrice,uint256 closePrice,uint256 collateralEngaged,int256 pnlUsdc,uint256 collateralReturned,uint256 totalFees)",
    RolloverAccrued:
        "event RolloverAccrued(uint256 indexed positionId,uint256 feeUsdc,uint256 totalAccruedFeeUsdc,uint256 asOfTimestamp)",
};

const LABELS = {
    OPEN: "Open Fee",
    CLOSE: "Close Fee",
    LIQUIDATION: "Liquidation Fee",
    ROLLOVER: "Rollover Fee",
}

// 2026-11-16 exploit: Balancer flash loans opening and closing 100x positions in the same tx at a stale oracle price
const EXPLOIT_TXS = new Set([
    "0x9e4d83d9131fcec6150adafa601042d20524a4e93290da591b77884b3c80eebe",
    "0xf07f2d31fc7b4b905032977c227d36d436d51b150fbfd1f47632954be72a2932",
    "0x281531abf28485cbbbee634e43dc49a4b5b8303afd88890b6cdb272e1652f495",
    "0xcd0b4aa29543fb70edb710ea3400d4cf01d061afc2744a739ec46fc8ac45a72c",
    "0xe7e6046e4ca443b4d66a8c3a70f35a89aefb8537bdacbfc6dee6229f907df045",
]);

const getPerpLogs = async (options: FetchOptions, eventAbi: string) => {
    const logs = await options.getLogs({ target: PERP_ADDRESS, eventAbi, onlyArgs: false });
    return logs.filter((log: any) => !EXPLOIT_TXS.has(log.transactionHash.toLowerCase())).map((log: any) => log.args);
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyUserFees = options.createBalances();

    const openedLogs = await getPerpLogs(options, ABIS.PositionOpened);
    const closedLogs = await getPerpLogs(options, ABIS.PositionClosed);
    const liquidatedLogs = await getPerpLogs(options, ABIS.PositionLiquidated);
    const rolloverLogs = await getPerpLogs(options, ABIS.RolloverAccrued);

    for (const log of openedLogs) {
        dailyVolume.add(USDC_ADDRESS, log.size);
        dailyFees.add(USDC_ADDRESS, log.openFee, LABELS.OPEN);
        dailyUserFees.add(USDC_ADDRESS, log.openFee, LABELS.OPEN);
    }

    for (const log of closedLogs) {
        dailyFees.add(USDC_ADDRESS, log.closeFee, LABELS.CLOSE);
        dailyUserFees.add(USDC_ADDRESS, log.closeFee, LABELS.CLOSE);
    }

    for (const log of liquidatedLogs) {
        dailyFees.add(USDC_ADDRESS, log.liquidationFee, LABELS.LIQUIDATION);
        dailyUserFees.add(USDC_ADDRESS, log.liquidationFee, LABELS.LIQUIDATION);
    }

    for (const log of rolloverLogs) {
        dailyFees.add(USDC_ADDRESS, log.feeUsdc, LABELS.ROLLOVER);
        dailyUserFees.add(USDC_ADDRESS, log.feeUsdc, LABELS.ROLLOVER);
    }

    const closedPositionIds = [
        ...closedLogs.map((log: any) => log.positionId),
        ...liquidatedLogs.map((log: any) => log.positionId),
    ].filter(Boolean);

    if (closedPositionIds.length) {
        const closedTrades = await options.api.multiCall({
            target: PERP_ADDRESS,
            abi: ABIS.closedTrades,
            calls: closedPositionIds,
            permitFailure: true,
        });

        for (const trade of closedTrades) {
            if (!trade) continue;
            dailyVolume.add(USDC_ADDRESS, trade.size);
        }
    }

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Volume:
        "Daily volume is tracked onchain from Arbitrum events. It counts position notional from PositionOpened events and finalized PositionClosed/PositionLiquidated records read from the perp contract.",
    Fees:
        "Daily fees are tracked onchain from Arbitrum events and include open fees, close fees, liquidation fees, and rollover accruals emitted by the perp contract.",
    Revenue:
        "All the fees (open fees, close fees, liquidation fees, and rollover accruals) are revenue.",
    ProtocolRevenue:
        "All the fees (open fees, close fees, liquidation fees, and rollover accruals) goes to the protocol.",
    UserFees:
        "Daily user fees are the total fees paid by traders onchain, including open fees, close fees, liquidation fees, and rollover accruals.",
};

const breakdownMethodology = {
    Fees: {
        [LABELS.OPEN]: "Open fees emitted in PositionOpened events.",
        [LABELS.CLOSE]: "Close fees emitted in PositionClosed events.",
        [LABELS.LIQUIDATION]: "Liquidation fees emitted in PositionLiquidated events.",
        [LABELS.ROLLOVER]: "Rollover fees emitted in RolloverAccrued events.",
    },
    UserFees: {
        [LABELS.OPEN]: "Open fees paid by traders.",
        [LABELS.CLOSE]: "Close fees paid by traders.",
        [LABELS.LIQUIDATION]: "Liquidation fees paid by traders.",
        [LABELS.ROLLOVER]: "Rollover fees accrued to traders.",
    },
    Revenue: {
        [LABELS.OPEN]: "Open fee revenue.",
        [LABELS.CLOSE]: "Close fee revenue.",
        [LABELS.LIQUIDATION]: "Liquidation fee revenue.",
        [LABELS.ROLLOVER]: "Rollover fee revenue.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ARBITRUM],
    start: "2026-04-15",
    methodology,
    breakdownMethodology,
};

export default adapter;
