import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

/*
 * Pool Party — Canton Network AMM (volume + fees)
 *
 * Source: https://api-mainnet.cantonwallet.com/canton/pool-party/public/v1/volume?period=24h
 * Spec:   https://github.com/0xsend/canton-monorepo/issues/3481
 *
 * Reports per-token volume and per-token fees across all pools. Volume is the
 * raw sum of per-token amounts across all swap legs (i.e. both sides of each
 * swap counted), matching the headline 24h volume displayed on Pool Party's
 * primary UI at https://cantonwallet.com/pools/.
 *
 * runAtCurrTime: true — Pool Party API exposes a current rolling-24h snapshot
 * only (no historical backfill / time-travel).
 */

const VOLUME_URL = "https://api-mainnet.cantonwallet.com/canton/pool-party/public/v1/volume?period=24h";

// Brale issues multiple instruments from the same issuer party; CUSD is
// reported with this UUID instrument ID on the volume API.
const CUSD_INSTRUMENT_ID = "481871d4-ca56-42a8-b2d3-4b7d28742946";

// Token IDs that have a direct CoinGecko listing — priced via slug.
const TOKEN_TO_CG: Record<string, string> = {
    "Amulet": "canton-network",         // Canton Coin (CC)
    "CBTC": "coinbase-wrapped-btc",     // cbBTC (Pool Party API uses "CBTC"; on-ledger instrumentId is CBBTC.B)
};

// Token IDs that are USD stablecoins without their own CoinGecko listing —
// priced as USDC ($1 stable proxy).
const STABLE_TOKENS = new Set([
    "USDCx",            // bridged USDC on Canton (original)
    "USDC.B",           // bridged USDC (new variant)
    "FRXUSD.B",         // Frax USD stablecoin (bridged)
    CUSD_INSTRUMENT_ID, // Send's privacy stablecoin (CUSD)
]);


const fetch = async (options: FetchOptions) => {
    const apiResponse: { volume: Record<string, string>, fees: Record<string, string> } = await fetchURL(VOLUME_URL);

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const addTokenAmounts = (balances: ReturnType<FetchOptions["createBalances"]>, data: Record<string, string>) => {
        for (const [token, amount] of Object.entries(data)) {
            const cgId = TOKEN_TO_CG[token];
            if (cgId) {
                balances.addCGToken(cgId, +amount);
            } else if (STABLE_TOKENS.has(token)) {
                balances.addUSDValue(+amount);
            }
            // Unknown tokens are silently skipped rather than thrown — Pool
            // Party's pool composition can change without an adapter update,
            // and we prefer an undercount to a crashed adapter.
        }
    };

    addTokenAmounts(dailyVolume, apiResponse.volume);
    addTokenAmounts(dailyFees, apiResponse.fees);

    return { dailyVolume, dailyFees, dailyUserFees: dailyFees };
};

const methodology = {
    Volume:
        "24h spot/swap volume across all live Pool Party pools, fetched from " +
        "Pool Party's public API on Send Foundation's validator " +
        "(api-mainnet.cantonwallet.com). Raw per-token volume across all swap " +
        "legs — matches the headline 24h volume displayed on Pool Party's " +
        "primary UI at cantonwallet.com/pools/. CC (Amulet) priced via " +
        "canton-network on CoinGecko; cbBTC (CBTC) priced via " +
        "coinbase-wrapped-btc on CoinGecko; USDCx, USDC.B, FRXUSD.B, and CUSD " +
        "priced as USDC ($1 stable proxy) since none have a direct CoinGecko " +
        "listing.",
    Fees:
        "All swap fees collected by Pool Party (24h), fetched from Pool Party's " +
        "public API on Send Foundation's validator (api-mainnet.cantonwallet.com). " +
        "Tokens priced the same way as Volume. Phase 2 will populate " +
        "supplySideRevenue, protocolRevenue, and holdersRevenue once Send's " +
        "per-swap fee attribution views are available.",
    UserFees: "All fees paid by users on swaps.",
};

const adapter: SimpleAdapter = {
    version: 2,
    methodology,
    runAtCurrTime: true,
    chains: [CHAIN.CANTON],
    fetch,
    skipBreakdownValidation: true,
};

export default adapter;
