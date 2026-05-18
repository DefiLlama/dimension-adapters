import { CHAIN } from "../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";

const PERP_ADDRESS = "0x54A62D550e1754f3bB34ad80501A63815297Fccc";
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

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

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyUserFees = options.createBalances();

    const openedLogs = await options.getLogs({
        target: PERP_ADDRESS,
        eventAbi: ABIS.PositionOpened,
    });

    const closedLogs = await options.getLogs({
        target: PERP_ADDRESS,
        eventAbi: ABIS.PositionClosed,
    });

    const liquidatedLogs = await options.getLogs({
        target: PERP_ADDRESS,
        eventAbi: ABIS.PositionLiquidated,
    });

    const rolloverLogs = await options.getLogs({
        target: PERP_ADDRESS,
        eventAbi: ABIS.RolloverAccrued,
    });

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
