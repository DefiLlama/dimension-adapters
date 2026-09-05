import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS_URL = "https://eosauthority.com/api/spa/rex/communityfunds?network=eos";
// eosauthority WAF blocks the default axios user-agent; a browser UA passes
const HEADERS = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const unixTodayInMs = options.startOfDay * 1000;

    const { chartSeries } = await httpGet(STATS_URL, { headers: HEADERS });
    chartSeries.forEach((chart: any) => {
        const feeType = chart.name;
        const feeToday = chart.data.find((entry: any) => entry[0] === unixTodayInMs);
        if (feeToday) {
          dailyFees.addCGToken("eos", feeToday[1], feeType)
        }
    })

    return {
        dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Includes income from bidnames,ramfee,cpuloan , netloan and powerup",
    Revenue: "No revenue, every stream is channeled to the REX pool",
    SupplySideRevenue: "All the fees are channeled to the REX pool, where they accrue to REX lenders"
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
    start: '2025-12-13',
    methodology,
    breakdownMethodology,
}

export default adapter;