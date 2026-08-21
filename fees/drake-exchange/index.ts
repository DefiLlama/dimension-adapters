import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const TRADING = "0xE6dfD064F1CFf4F62236fC862A2543EA98380F32";
const COMMON_HELPER = "0x4939AEf78CD2Dc2bAE5bf9DA51C61A113Cae909a";
const AUSD = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";
const PLATFORM_MANAGER = "0x7940575377C3c2ABdA23813c123b4C880E217d6d";

const COMMISSION_FEE = 3;
const MARGIN_CHANGE_FEE = 4;

type FeeSplit = { vault: number; treasury: number };
type SplitSchedule = Array<{ fromBlock: number } & FeeSplit>;

// Last matching fromBlock wins. Append a row when the on-chain split changes.
const ORDERBOOK_SPLIT: SplitSchedule = [
    { fromBlock: 0, vault: 0.2, treasury: 0.8 },
];

const AMM_SPLIT: SplitSchedule = [
    { fromBlock: 0, vault: 0.6, treasury: 0.4 },
    { fromBlock: 96996873, vault: 0.4, treasury: 0.6 },
];

function splitAt(schedule: SplitSchedule, block: number): FeeSplit {
    let split = schedule[0];
    for (const row of schedule) {
        if (block >= row.fromBlock) split = row;
    }
    return split;
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const trades = await options.getLogs({
        target: TRADING,
        eventAbi:
            "event TakerOrderExecuted(uint256 indexed orderId, address indexed portfolio, uint256 indexed instId, uint8 side, uint8 orderKind, uint256 executionPrice, uint256 orderbookVolume, uint256 vaultVolume)",
    });
    const fillRatioByTx: Record<string, number> = {};
    trades.forEach((t: any) => {
        const ob = BigInt(t.orderbookVolume);
        const amm = BigInt(t.vaultVolume);
        const total = ob + amm;
        if (total > 0n)
            fillRatioByTx[t.transactionHash] = Number(ob) / Number(total);
    });

    const transfers = await options.getLogs({
        target: COMMON_HELPER,
        eventAbi:
            "event AssetTransferred(address indexed _portfolio, uint8 _actionType, int256 _amountIn)",
    });

    transfers.forEach((tr: any) => {
        if (
            tr._actionType !== COMMISSION_FEE &&
            tr._actionType !== MARGIN_CHANGE_FEE
        )
            return;
        const amt =
            tr._amountIn < 0n ? -BigInt(tr._amountIn) : BigInt(tr._amountIn);

        if (tr._actionType === MARGIN_CHANGE_FEE) {
            dailyFees.add(AUSD, amt, METRIC.MARGIN_FEES);
            dailySupplySideRevenue.add(AUSD, amt, METRIC.MARGIN_FEES);
            return;
        }

        dailyFees.add(AUSD, amt, METRIC.TRADING_FEES);
        const ratio = fillRatioByTx[tr.transactionHash] ?? 0;
        const block = Number(tr.blockNumber);
        const orderbookSplit = splitAt(ORDERBOOK_SPLIT, block);
        const ammSplit = splitAt(AMM_SPLIT, block);
        const vaultPct =
            ratio * orderbookSplit.vault + (1 - ratio) * ammSplit.vault;
        const treasuryPct = 1 - vaultPct;
        dailySupplySideRevenue.add(
            AUSD,
            (amt * BigInt(Math.round(vaultPct * 10000))) / 10000n,
            METRIC.TRADING_FEES,
        );
        dailyRevenue.add(
            AUSD,
            (amt * BigInt(Math.round(treasuryPct * 10000))) / 10000n,
            METRIC.TRADING_FEES,
        );
    });

    const fbFees = await options.getLogs({
        target: PLATFORM_MANAGER, // confirm emitting contract — see TL;DR
        eventAbi:
            "event PositionPendingFBFeeCharged(address indexed portfolio, int256 totalFBFee)",
    });
    fbFees.forEach((f: any) => {
        if (f.totalFBFee <= 0n) return;
        dailyFees.add(AUSD, BigInt(f.totalFBFee), METRIC.BORROW_INTEREST);
        dailySupplySideRevenue.add(AUSD, BigInt(f.totalFBFee), METRIC.BORROW_INTEREST);
    });

    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "Trading commission on orderbook and AMM fills.",
        [METRIC.MARGIN_FEES]: "Isolated margin add/reduce fees.",
        [METRIC.BORROW_INTEREST]: "Net borrowing and imbalance funding fees charged to traders.",
    },
    Revenue: {
        [METRIC.TRADING_FEES]: "Treasury share of trading commission per the orderbook and AMM splits in effect at that block.",
    },
    SupplySideRevenue: {
        [METRIC.TRADING_FEES]: "Liquidity vault share of trading commission per the orderbook and AMM splits in effect at that block.",
        [METRIC.MARGIN_FEES]: "100% of isolated margin add/reduce fees routed to the liquidity vault.",
        [METRIC.BORROW_INTEREST]: "100% of borrowing and funding fees routed to the liquidity vault.",
    },
};

export default {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.MONAD],
    start: 1783409183,
    fetch,
    methodology: {
        Fees: "All trading commission fees (orderbook + AMM), isolated margin add/reduce fees, and net borrowing/imbalance funding fees charged to traders.",
        Revenue:
            "Share of trade commission fees routed to the Operation Vault (treasury) per the orderbook and AMM splits in effect at that block.",
        SupplySideRevenue:
            "Share routed to the Liquidity Vault per the orderbook and AMM splits in effect at that block, plus 100% of margin-change and borrowing/funding fees.",
    },
    breakdownMethodology,
} as SimpleAdapter;
