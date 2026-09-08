import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

const TRADING = "0xE6dfD064F1CFf4F62236fC862A2543EA98380F32";
const COMMON_HELPER = "0x4939AEf78CD2Dc2bAE5bf9DA51C61A113Cae909a";
const AUSD = ADDRESSES.monad.AUSD;
const PLATFORM_MANAGER = "0x7940575377C3c2ABdA23813c123b4C880E217d6d";

const COMMISSION_FEE = 3;
const MARGIN_CHANGE_FEE = 4;
const ASSET_TRANSFERRED_EVENT =
    "event AssetTransferred(address indexed _portfolio, uint8 _actionType, int256 _amountIn)";
// Drake emitted a single net funding/borrowing fee before the protocol upgrade.
const LEGACY_PENDING_FB_FEE_EVENT =
    "event PositionPendingFBFeeCharged(address indexed portfolio, int256 totalFBFee)";
const PENDING_FB_FEE_EVENT =
    "event PositionPendingFBFeeCharged(address indexed portfolio, int256 fundingFee, int256 borrowingFee)";

// Order sizes carry 4 decimals on-chain (TypeLibrary.BPS_SCALING_FACTOR = 1e4);
// notional (AUSD base units) = size * executionPrice / SIZE_SCALE.
const SIZE_SCALE = 10_000n;

// dailyVolume breakdown labels: taker fills are matched against the orderbook, the
// liquidity vault (AMM), or both in one fill.
const ORDERBOOK_VOLUME = "Orderbook Volume";
const AMM_VOLUME = "AMM Volume";

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
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const trades = await options.getLogs({
        target: TRADING,
        onlyArgs: false,
        eventAbi:
            "event TakerOrderExecuted(uint256 indexed orderId, address indexed portfolio, uint256 indexed instId, uint8 side, uint8 orderKind, uint256 executionPrice, uint256 orderbookVolume, uint256 vaultVolume)",
    });
    const fillRatioByTx: Record<string, number> = {};
    trades.forEach((t: any) => {
        const ob = BigInt(t.args.orderbookVolume);
        const amm = BigInt(t.args.vaultVolume);
        const totalSize = ob + amm;
        const price = BigInt(t.args.executionPrice);

        if (ob > 0n)
            dailyVolume.add(AUSD, (ob * price) / SIZE_SCALE, ORDERBOOK_VOLUME);
        if (amm > 0n)
            dailyVolume.add(AUSD, (amm * price) / SIZE_SCALE, AMM_VOLUME);
        // Venue split is a size ratio (both legs share the same execution price).
        if (totalSize > 0n)
            fillRatioByTx[t.transactionHash] = Number(ob) / Number(totalSize);
    });

    const transfers = await options.getLogs({
        target: COMMON_HELPER,
        onlyArgs: false,
        eventAbi: ASSET_TRANSFERRED_EVENT,
    });

    transfers.forEach((tr: any) => {
        // Decoders return uint8 values as either bigint (ethers) or string (indexer).
        const actionType = BigInt(tr.args._actionType);
        if (
            actionType !== BigInt(COMMISSION_FEE) &&
            actionType !== BigInt(MARGIN_CHANGE_FEE)
        )
            return;
        const amountIn = BigInt(tr.args._amountIn);
        const amt = amountIn < 0n ? -amountIn : amountIn;

        if (actionType === BigInt(MARGIN_CHANGE_FEE)) {
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
        // Assign the remainder to the treasury to preserve the fee-accounting invariant.
        const vaultAmount =
            (amt * BigInt(Math.round(vaultPct * 10000))) / 10000n;
        dailySupplySideRevenue.add(
            AUSD,
            vaultAmount,
            METRIC.TRADING_FEES,
        );
        dailyRevenue.add(
            AUSD,
            amt - vaultAmount,
            METRIC.TRADING_FEES,
        );
    });

    const [legacyFbFees, fbFees] = await Promise.all([
        options.getLogs({
            target: PLATFORM_MANAGER,
            eventAbi: LEGACY_PENDING_FB_FEE_EVENT,
        }),
        options.getLogs({
            target: PLATFORM_MANAGER,
            eventAbi: PENDING_FB_FEE_EVENT,
        }),
    ]);
    const addPositiveFundingOrBorrowingFee = (fee: bigint) => {
        if (fee <= 0n) return;
        dailyFees.add(AUSD, fee, METRIC.BORROW_INTEREST);
        dailySupplySideRevenue.add(AUSD, fee, METRIC.BORROW_INTEREST);
    };
    legacyFbFees.forEach((f: any) => {
        addPositiveFundingOrBorrowingFee(BigInt(f.totalFBFee));
    });
    fbFees.forEach((f: any) => {
        addPositiveFundingOrBorrowingFee(
            BigInt(f.fundingFee) + BigInt(f.borrowingFee),
        );
    });

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const breakdownMethodology = {
    Volume: {
        [ORDERBOOK_VOLUME]:
            "Notional (size x execution price, in AUSD) of taker fills matched against the orderbook.",
        [AMM_VOLUME]:
            "Notional (size x execution price, in AUSD) of taker fills matched against the liquidity vault (AMM).",
    },
    Fees: {
        [METRIC.TRADING_FEES]: "Trading commission on orderbook and AMM fills.",
        [METRIC.MARGIN_FEES]: "Isolated margin add/reduce fees.",
        [METRIC.BORROW_INTEREST]:
            "Net borrowing and imbalance funding fees charged to traders.",
    },
    Revenue: {
        [METRIC.TRADING_FEES]:
            "Treasury share of trading commission per the orderbook and AMM splits in effect at that block.",
    },
    ProtocolRevenue: {
        [METRIC.TRADING_FEES]:
            "Treasury share of trading commission per the orderbook and AMM splits in effect at that block.",
    },
    SupplySideRevenue: {
        [METRIC.TRADING_FEES]:
            "Liquidity vault share of trading commission per the orderbook and AMM splits in effect at that block.",
        [METRIC.MARGIN_FEES]:
            "100% of isolated margin add/reduce fees routed to the liquidity vault.",
        [METRIC.BORROW_INTEREST]:
            "100% of borrowing and funding fees routed to the liquidity vault.",
    },
};

export default {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.MONAD],
    start: "2026-07-07",
    fetch,
    methodology: {
        Volume: "Notional taker volume (size x execution price, in AUSD) across orderbook and AMM fills.",
        Fees: "All trading commission fees (orderbook + AMM), isolated margin add/reduce fees, and net borrowing/imbalance funding fees charged to traders.",
        Revenue:
            "Share of trade commission fees routed to the Operation Vault (treasury) per the orderbook and AMM splits in effect at that block.",
        ProtocolRevenue:
            "Share of trade commission fees routed to the Operation Vault (treasury) per the orderbook and AMM splits in effect at that block.",
        SupplySideRevenue:
            "Share routed to the Liquidity Vault per the orderbook and AMM splits in effect at that block, plus 100% of margin-change and borrowing/funding fees.",
    },
    breakdownMethodology,
} as SimpleAdapter;
