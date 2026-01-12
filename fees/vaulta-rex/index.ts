import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const STATS_URL = "https://eosauthority.com/api/spa/rex/communityfunds?network=eos";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const unixTodayInMs = options.endTimestamp * 1000;

    const { chartSeries } = await fetchURL(STATS_URL);
    chartSeries.forEach((chart: any) => {
        const feeType = chart.name;
        const feeToday = chart.data.find((entry: any) => entry[0] === unixTodayInMs)[1];
        dailyFees.addCGToken("eos", feeToday, feeType)
    })

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailySupplySideRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Includes income from bidnames,ramfee,cpuloan , netloan and powerup",
    Revenue: "All the fees are revenue",
    SupplySideRevenue: "All the fees goes to supplyside"
};

const breakdownMethodology = {
    Fees: {
        ["bidnames"]: "Action in the eosio.system contract to place a bid on premium (short <12 character) account names via auction.",
        ["ramfee"]: "System account (eosio.ramfee) that collects the 0.5% fee from RAM buy/sell transactions to fund network operations.",
        ["cpuloan"]: "REX-related action (e.g., fundcpuloan or defcpuloan) to manage funding or deferring CPU resource loans from staked tokens for temporary bandwidth boosts.",
        ["netloan"]: "Database table (netloan) in the system contract tracking active REX loans specifically for NET bandwidth resources rented via actions like rentnet.",
        ["powerup"]: "System action to pay a fee (in core tokens) for renting a fractional share of CPU and/or NET resources from the chain-owned pool for a configurable period (typically 24 hours), replacing staking/REX as the primary resource allocation model."
    }
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.EOS],
    methodology,
    breakdownMethodology,
    runAtCurrTime: true,
}

export default adapter;