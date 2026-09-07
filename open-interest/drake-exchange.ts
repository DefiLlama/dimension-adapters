/**
 * Drake Exchange (Monad) open-interest adapter.
 *
 * Reads per-instrument long/short open interest directly from the PlatformManager
 * contract at the end of each period and reports:
 *   - openInterestAtEnd      = sum over instruments of (long + short)
 *   - longOpenInterestAtEnd  = sum over instruments of long OI
 *   - shortOpenInterestAtEnd = sum over instruments of short OI
 */
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
 * Fetches end-of-period open interest. `options.api` is pinned to the period-end block.
 *
 * @param options DefiLlama fetch options for the period.
 * @returns `openInterestAtEnd`, `longOpenInterestAtEnd`, `shortOpenInterestAtEnd` as Balances.
 * @throws If any view reverts (e.g. stale oracle price at the end block) or the RPC fails.
 */
const fetch = async (options: FetchOptions) => {
    const nextInstId = Number(
        await options.api.call({ target: PLATFORM_MANAGER, abi: ABI.nextInstId }),
    );
    // instrument ids are 1 .. nextInstId-1
    const calls = Array.from({ length: nextInstId - 1 }, (_, i) => ({
        target: PLATFORM_MANAGER,
        params: [i + 1],
    }));
    const [longs, shorts] = await Promise.all([
        options.api.multiCall({ abi: ABI.openInterestLong, calls }),
        options.api.multiCall({ abi: ABI.openInterestShort, calls }),
    ]);

    const longOpenInterestAtEnd = options.createBalances();
    const shortOpenInterestAtEnd = options.createBalances();
    // Values are already in AUSD base units (6 decimals): size * oracle price / 1e4
    longs.forEach((oi: any) => longOpenInterestAtEnd.add(AUSD, oi));
    shorts.forEach((oi: any) => shortOpenInterestAtEnd.add(AUSD, oi));

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
