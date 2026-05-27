import { SimpleAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";

const BACKEND_API_URL = 'https://api-defi.kaspa.com/dex';
const DAY_IN_SECONDS = 86400;

const chainConfig = {
    [CHAIN.KASPLEX]: {
        start: "2025-09-26",
        network: ""
    },
    [CHAIN.IGRA]: {
        start: "2026-03-26",
        network: "igra",
    },
}

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const minDate = options.startOfDay;
    const maxDate = options.startOfDay + DAY_IN_SECONDS;

    const networkParam = chainConfig[options.chain].network ? `&network=${chainConfig[options.chain].network}` : '';
    const url = `${BACKEND_API_URL}/most-traded/pairs?minDate=${minDate}&maxDate=${maxDate}${networkParam}`;

    const response = await fetchURL(url);
    if (!response || !response.pairs || !Array.isArray(response.pairs)) {
        throw new Error('Api returned invalid response');
    }

    const pairs = response.pairs;

    let totalVolumeKas = 0;
    pairs.forEach((entry: any) => {
        totalVolumeKas += Number(entry.amountKAS);
    });

    const dailyVolume = options.createBalances();
    dailyVolume.addCGToken("kaspa", totalVolumeKas);

    const dailyFees = dailyVolume.clone(0.01);
    const dailyRevenue = dailyFees.clone(1 / 6);
    const dailySupplySideRevenue = dailyFees.clone(5 / 6);

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "Trades incur a 1% swap fee that is entirely paid by users.",
    UserFees: "Users pay the 1% swap fee on each swap.",
    Revenue: "The protocol collects 1/6 of accumulated LP fees when liquidity is moved.",
    ProtocolRevenue: "Factory captures ~0.1667% of swap volume (1/6 of fees) via LP token claims.",
    SupplySideRevenue: "Liquidity providers keep the remaining 5/6 of the 1% swap fee (~0.8333%).",
    HoldersRevenue: "No direct revenue share to token holders.",
};


const adapter: SimpleAdapter = {
    version: 1,
    methodology,
    fetch,
    adapter: chainConfig,
};

export default adapter;
