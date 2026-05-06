import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

/*
 * Pool Party — Canton Network AMM (volume)
 *
 * Source: https://api-mainnet.cantonwallet.com/canton/pool-party/public/v1/volume?period=24h
 * Spec:   https://github.com/0xsend/canton-monorepo/issues/3481
 *
 * Pool Party reports volume per token across all pools. In an AMM each swap
 * touches both sides of a pair, so the sum across instruments is 2× the true
 * single-side trading volume. We halve before pricing.
 *
 * runAtCurrTime: true — Pool Party API exposes a current rolling-24h snapshot
 * only (no historical backfill / time-travel). Tells the dimension-adapters
 * framework not to request past-window data.
 */

const VOLUME_URL = "https://api-mainnet.cantonwallet.com/canton/pool-party/public/v1/volume?period=24h";

// Pool Party SDK instrument IDs (stable per Send Foundation):
//   "Amulet"  : Canton Coin (CC) — priced via coingecko:canton-network
//   "USDCx"   : bridged USDC on Canton — priced as USDC ($1 stable proxy)
//   CUSD UUID : Send's privacy stablecoin — priced as USDC ($1 stable proxy)
//
// Brale issues multiple instruments (CUSD + SBC) from the same issuer party;
// only the CUSD UUID below is in scope. Unknown instrument IDs are skipped.
const CUSD_INSTRUMENT_ID = "481871d4-ca56-42a8-b2d3-4b7d28742946";


const fetch = async (options: FetchOptions) => {
    const apiResponse: { volume: Record<string, string>, fees: Record<string, string> } = await fetchURL(VOLUME_URL);

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const addTokenAmounts = (balances: ReturnType<FetchOptions["createBalances"]>, data: Record<string, string>, divisor = 1) => {
        for (const [token, amount] of Object.entries(data)) {
            if (token === "Amulet") {
                balances.addGasToken(+amount / divisor);
            } else if (token === "USDCx" || token === CUSD_INSTRUMENT_ID) {
                balances.addUSDValue(+amount / divisor);
            } else {
                throw new Error(`Unknown token: ${token}`);
            }
        }
    };

    addTokenAmounts(dailyVolume, apiResponse.volume, 2);
    addTokenAmounts(dailyFees, apiResponse.fees);

    return { dailyVolume, dailyFees, dailyUserFees: dailyFees };
};

const methodology = {
    Volume:
        "24h spot/swap volume across CC, CUSD, and USDCx pools, fetched from " +
        "Pool Party's public API on Send Foundation's validator " +
        "(api-mainnet.cantonwallet.com). Per-token volumes are halved to " +
        "single-count AMM swaps. CC priced via canton-network on CoinGecko; " +
        "CUSD and USDCx priced as USDC ($1 stable proxy) since neither has a " +
        "direct CoinGecko listing.",
    Fees:
        "All swap fees collected by Pool Party (24h), fetched from Pool Party's " +
        "public API on Send Foundation's validator (api-mainnet.cantonwallet.com). " +
        "CC fees priced via canton-network on CoinGecko; CUSD and USDCx fees " +
        "priced as USDC ($1 stable proxy). Phase 2 will populate " +
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