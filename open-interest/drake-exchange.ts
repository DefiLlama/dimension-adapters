/**
 * Drake Exchange (Monad) open-interest adapter.
 *
 * Reads per-instrument long/short open interest directly from the PlatformManager
 * contract at the end of each period and reports:
 *   - openInterestAtEnd      = sum over instruments of (long + short)
 *   - longOpenInterestAtEnd  = sum over instruments of long OI
 *   - shortOpenInterestAtEnd = sum over instruments of short OI
 */
import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

/** PlatformManager proxy on Monad mainnet; owns OI state and the instrument registry. */
const PLATFORM_MANAGER = "0x7940575377C3c2ABdA23813c123b4C880E217d6d";
/** Settlement token; every OI value returned by PlatformManager is denominated in it. */
const AUSD = ADDRESSES.monad.AUSD;

/** PlatformManager view ABIs used by this adapter. */
const ABI = {
    /** Next unassigned instrument id; live instrument ids are 1 .. nextInstId-1. */
    nextInstId: "function nextInstId() view returns (uint256)",
    /** Long-side notional OI for one instrument, in AUSD base units. */
    openInterestLong:
        "function openInterestLong(uint256 _instId) view returns (uint256)",
    /** Short-side notional OI for one instrument, in AUSD base units. */
    openInterestShort:
        "function openInterestShort(uint256 _instId) view returns (uint256)",
};

/**
 * Oracle-revert retry parameters.
 *
 * openInterestLong/Short price positions through the oracle (maxPublishAge = 12s on-chain),
 * so a read at a block with no fresh, valid oracle price reverts. Only those reverts are
 * retried: the adapter walks *backwards* from the period-end block in steps of
 * RETRY_STEP_BLOCKS (Monad ~0.4s blocks, so 25 blocks ~= 10s) for up to MAX_ATTEMPTS
 * attempts, keeping the reported value at-or-before period end. Any other error (RPC or
 * transport failure, unrelated contract revert) is rethrown immediately so the run fails
 * rather than reporting OI from an earlier block.
 */
const RETRY_STEP_BLOCKS = 25;
const MAX_ATTEMPTS = 6; // covers ~1 minute before the end block

/**
 * 4-byte selectors of the transient oracle-validation reverts raised while pricing OI:
 * Pyth `StalePrice()` and OracleRouter `ConfidenceTooHigh()` / `FuturePriceTimestamp()`.
 */
const ORACLE_REVERT_SELECTORS = [
    "0x19abf40e", // StalePrice()
    "0x9ebd92e3", // ConfidenceTooHigh()
    "0x06a874f5", // FuturePriceTimestamp()
];

/**
 * True when `error` is a contract revert carrying one of ORACLE_REVERT_SELECTORS.
 *
 * The sdk's multiCall wraps per-call reverts into `_underlyingErrors` strings that embed the
 * revert data (e.g. `invalid length for result data (value="0x19abf40e", ...)`), so the
 * selector can be matched by substring. RPC/transport failures carry no selector and are
 * therefore never treated as retryable.
 */
function isOracleRevert(error: any): boolean {
    const parts = [
        error?.message,
        error?._underlyingError,
        ...(Array.isArray(error?._underlyingErrors) ? error._underlyingErrors : []),
    ].map((part) => String(part ?? "").toLowerCase());
    return parts.some((part) =>
        ORACLE_REVERT_SELECTORS.some((selector) => part.includes(selector)),
    );
}

/**
 * Reads long and short OI for every live instrument at the block pinned on `api`.
 *
 * @param api ChainApi bound to the block to read state at.
 * @returns Raw per-instrument OI arrays (index i => instrument id i+1), in AUSD base units.
 * @throws If any underlying call reverts (e.g. stale oracle price) or the RPC fails.
 */
async function readOpenInterest(api: ChainApi) {
    const nextInstId = Number(
        await api.call({ target: PLATFORM_MANAGER, abi: ABI.nextInstId }),
    );
    // instrument ids are 1 .. nextInstId-1
    const calls = Array.from({ length: nextInstId - 1 }, (_, i) => ({
        target: PLATFORM_MANAGER,
        params: [i + 1],
    }));
    const [longs, shorts] = await Promise.all([
        api.multiCall({ abi: ABI.openInterestLong, calls }),
        api.multiCall({ abi: ABI.openInterestShort, calls }),
    ]);
    return { longs, shorts };
}

/**
 * Fetches end-of-period open interest.
 *
 * Attempt 0 uses `options.api` (already pinned to the period-end block); subsequent
 * attempts construct a ChainApi at progressively earlier blocks per the retry parameters
 * above. Only oracle-validation reverts (see `isOracleRevert`) trigger a retry; every other
 * error is rethrown at once. If all attempts fail the last oracle error is rethrown so the
 * run fails loudly instead of recording zero OI.
 *
 * @param options DefiLlama fetch options for the period.
 * @returns `openInterestAtEnd`, `longOpenInterestAtEnd`, `shortOpenInterestAtEnd` as Balances.
 */
const fetch = async (options: FetchOptions) => {
    const toBlock = await options.getToBlock();
    let result: { longs: any[]; shorts: any[] } | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !result; attempt++) {
        const api =
            attempt === 0
                ? options.api
                : new ChainApi({
                      chain: options.chain,
                      block: toBlock - attempt * RETRY_STEP_BLOCKS,
                  });
        try {
            result = await readOpenInterest(api);
        } catch (e) {
            if (!isOracleRevert(e)) throw e;
            lastError = e;
        }
    }
    if (!result)
        throw new Error(
            `drake-exchange OI: no valid oracle price within ${MAX_ATTEMPTS} attempts before block ${toBlock}: ${lastError}`,
        );

    const longOpenInterestAtEnd = options.createBalances();
    const shortOpenInterestAtEnd = options.createBalances();
    // Values are already in AUSD base units (6 decimals): size * oracle price / 1e4
    result.longs.forEach((oi: any) => longOpenInterestAtEnd.add(AUSD, oi));
    result.shorts.forEach((oi: any) => shortOpenInterestAtEnd.add(AUSD, oi));

    const openInterestAtEnd = longOpenInterestAtEnd.clone();
    openInterestAtEnd.addBalances(shortOpenInterestAtEnd);

    return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd };
};

/**
 * Adapter definition. `start` matches the fees adapter's launch date.
 * `pullHourly` is deliberately false: open interest is a point-in-time snapshot, not a flow.
 * Under pullHourly the runner sums the 24 hourly records into the daily value, which would
 * report ~24x the real OI. With daily pulls the single end-of-day reading is stored as-is.
 */
export default {
    version: 2,
    pullHourly: false, // OI is a snapshot; hourly records would be summed into the daily value
    chains: [CHAIN.MONAD],
    start: "2026-07-07",
    fetch,
    methodology: {
        OpenInterest:
            "Sum of long and short open interest across all instruments, read from contract state at the end of the period. Values are notional in AUSD (position size x oracle price).",
    },
} as SimpleAdapter;
