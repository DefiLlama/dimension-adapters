import { CHAIN } from "../../helpers/chains";
import type { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";

/**
 * SilentSwap volume adapter.
 *
 * SilentSwap is a privacy-preserving cross-chain swap protocol. The on-chain
 * gateway contracts route per-order funds and intentionally are not exposed
 * to indexers — surfacing them would leak the user-level activity that the
 * protocol is designed to keep private.
 *
 * Instead, the SilentSwap operator publishes anonymized aggregate USD totals
 * to an upgradeable reporter contract on BNB Chain (`SilentSwapStats`,
 * deployed behind an ERC-1967 UUPS proxy). The contract holds only
 * aggregates (no addresses, no per-order data) and every update is recorded
 * as on-chain history.
 *
 * Source repo for the reporter contract:
 *   https://github.com/SilentSwapV2/silentswap-dashboard/tree/main/contracts
 */

const STATS_CONTRACT = "0x5894a9B8B342BDb1AD7570C3656eE406eE26f676"; // BNB mainnet, deployed 2026-05-25

const ONE_DAY_SECONDS = 24 * 60 * 60;

const inflowUsdAbi = "function inflowUsd() view returns (uint256)";
const volumeByDateAbi =
    "function volumeByDate(uint64) view returns (" +
    "uint128 cumulativeUsd, uint128 inflowUsd, uint128 outflowUsd, " +
    "uint128 dailyUsd, uint64 transferCount, uint32 tokenCount, " +
    "uint64 bnbBlock, uint64 publishedAt)";

function yyyymmdd(ts: number): bigint {
    const d = new Date(ts * 1000);
    return BigInt(
        d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(),
    );
}

async function readInflowAtDate(api: FetchOptions["api"], date: bigint): Promise<bigint> {
    const snap = await api.call({
        target: STATS_CONTRACT,
        abi: volumeByDateAbi,
        params: [date.toString()],
    });
    // The decoded named tuple has `inflowUsd` at index 1.
    const inflow =
        (snap as { inflowUsd?: string | bigint })?.inflowUsd ??
        (snap as Array<string | bigint>)[1] ??
        0n;
    return BigInt(inflow);
}

const fetch: FetchV2 = async ({ api, startTimestamp }) => {
    const date = yyyymmdd(startTimestamp);
    const prevDate = yyyymmdd(startTimestamp - ONE_DAY_SECONDS);

    const [todayInflow6, prevInflow6, cumulativeInflow6] = await Promise.all([
        readInflowAtDate(api, date),
        readInflowAtDate(api, prevDate),
        api.call({ target: STATS_CONTRACT, abi: inflowUsdAbi }) as Promise<bigint | string>,
    ]);

    const dailyInflow6 =
        todayInflow6 > prevInflow6 ? todayInflow6 - prevInflow6 : todayInflow6;

    return {
        dailyVolume: Number(dailyInflow6) / 1e6,
        totalVolume: Number(BigInt(cumulativeInflow6)) / 1e6,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    methodology: {
        Volume:
            "Anonymized inflow series read from the SilentSwapStats reporter " +
            "contract on BNB Chain (" + STATS_CONTRACT + "). " +
            "dailyVolume = volumeByDate(date).inflowUsd - " +
            "volumeByDate(date-1).inflowUsd; totalVolume = inflowUsd(). " +
            "Per-order gateway addresses are intentionally not exposed to " +
            "preserve user privacy.",
    },
    adapter: {
        [CHAIN.BSC]: {
            fetch,
            start: "2026-05-25",
            // The reporter contract stores per-date snapshots as current state
            // (`volumeByDate[date]` is monotonic and never overwritten), so
            // current-block reads return the correct historical day values
            // without needing an archive node.
            runAtCurrTime: true,
        },
    },
};

export default adapter;
