import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";
import { ASSET_TRANSFERRED_EVENT, getCommissionTransfers } from "./feeTransfers";

const TRADING = "0xE6dfD064F1CFf4F62236fC862A2543EA98380F32";
const COMMON_HELPER = "0x4939AEf78CD2Dc2bAE5bf9DA51C61A113Cae909a";
const AUSD = ADDRESSES.monad.AUSD;
const PLATFORM_MANAGER = "0x7940575377C3c2ABdA23813c123b4C880E217d6d";
// Mainnet liquidity vault, also used by the TVL adapter; receives the supplier cut.
// https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/drake-exchange/index.js
const VAULT = "0x8379c32A965a7Bac7289893AA3861f01dD470049";

const COMMISSION_FEE = 3;
const MARGIN_CHANGE_FEE = 4;
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

const TRADING_TO_TREASURY = "Trading Fees To Treasury";
const TRADING_TO_VAULT = "Trading Fees To Vault";
const MARGIN_TO_VAULT = "Margin Fees To Vault";
const BORROW_TO_VAULT = "Borrow Interest To Vault";

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
    trades.forEach((t: any) => {
        const ob = BigInt(t.args.orderbookVolume);
        const amm = BigInt(t.args.vaultVolume);
        const price = BigInt(t.args.executionPrice);

        if (ob > 0n)
            dailyVolume.add(AUSD, (ob * price) / SIZE_SCALE, ORDERBOOK_VOLUME);
        if (amm > 0n)
            dailyVolume.add(AUSD, (amm * price) / SIZE_SCALE, AMM_VOLUME);
    });

    const transfers = await options.getLogs({
        target: COMMON_HELPER,
        onlyArgs: false,
        eventAbi: ASSET_TRANSFERRED_EVENT,
    });

    const commissionByTx = new Map<string, bigint>();
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
            dailySupplySideRevenue.add(AUSD, amt, MARGIN_TO_VAULT);
            return;
        }

        dailyFees.add(AUSD, amt, METRIC.TRADING_FEES);
        const hash = tr.transactionHash.toLowerCase();
        commissionByTx.set(hash, (commissionByTx.get(hash) ?? 0n) + amt);
    });

    // Receipt transfers capture historical rate/recipient changes, maker vs taker
    // attribution, multiple fills, and the contract's exact integer rounding.
    const hashes = [...commissionByTx.keys()];
    const receipts = hashes.length ? await getTxReceiptsWithRetry(options.chain, hashes) : [];
    receipts.forEach((receipt, index) => {
        if (!receipt) throw new Error(`Missing Drake commission receipt ${hashes[index]}`);
        const allocations = getCommissionTransfers(receipt.logs, AUSD, COMMON_HELPER, VAULT);
        const total = allocations.reduce((sum, allocation) => sum + allocation.amount, 0n);
        if (total !== commissionByTx.get(hashes[index]))
            throw new Error(`Drake commission logs do not reconcile with receipt ${hashes[index]}`);
        allocations.forEach(({ vaultAmount, revenue }) => {
            dailySupplySideRevenue.add(AUSD, vaultAmount, TRADING_TO_VAULT);
            dailyRevenue.add(AUSD, revenue, TRADING_TO_TREASURY);
        });
    });

    const legacyFbFees = await options.getLogs({
        target: PLATFORM_MANAGER,
        eventAbi: LEGACY_PENDING_FB_FEE_EVENT,
    });
    const fbFees = await options.getLogs({
        target: PLATFORM_MANAGER,
        eventAbi: PENDING_FB_FEE_EVENT,
    });
    const addPositiveFundingOrBorrowingFee = (fee: bigint) => {
        if (fee <= 0n) return;
        dailyFees.add(AUSD, fee, METRIC.BORROW_INTEREST);
        dailySupplySideRevenue.add(AUSD, fee, BORROW_TO_VAULT);
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
        [TRADING_TO_TREASURY]:
            "Actual trading commission transferred to the operation recipient, matched immediately before each commission event.",
    },
    ProtocolRevenue: {
        [TRADING_TO_TREASURY]:
            "Actual trading commission transferred to the operation recipient, matched immediately before each commission event.",
    },
    SupplySideRevenue: {
        [TRADING_TO_VAULT]:
            "Actual trading commission transferred to the liquidity vault, matched immediately before each commission event.",
        [MARGIN_TO_VAULT]:
            "100% of isolated margin add/reduce fees routed to the liquidity vault.",
        [BORROW_TO_VAULT]:
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
            "Actual trading commission transferred to the operation recipient (treasury), read from transaction receipts without hardcoded fee splits.",
        ProtocolRevenue:
            "Actual trading commission transferred to the operation recipient (treasury), read from transaction receipts without hardcoded fee splits.",
        SupplySideRevenue:
            "Actual trading commission transferred to the liquidity vault, plus margin-change and positive net borrowing/funding fees.",
    },
    breakdownMethodology,
} as SimpleAdapter;
