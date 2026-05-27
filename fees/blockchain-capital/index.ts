import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BCAP_TOKEN = "0x57fD71a86522Dc06D6255537521886057c1772A3";
const PRICE_FEED = "0x0eF2418216476Ab5264821070B8c24b6B458F796";
const TOKEN_DECIMALS = 2;
const REDSTONE_ORACLE_DECIMALS = 8;
const MANAGEMENT_FEE = 2.5 / 100;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

const priceFeedAbi = "function latestAnswer() view returns (int256)";

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances();

    const priceAfter = await options.toApi.call({ target: PRICE_FEED, abi: priceFeedAbi });

    const currentPrice = priceAfter / 10 ** REDSTONE_ORACLE_DECIMALS;

    const totalSupply = await options.api.call({
        target: BCAP_TOKEN,
        abi: "function totalSupply() view returns (uint256)",
    });
    const totalSupplyAfterDecimals = totalSupply / 10 ** TOKEN_DECIMALS;

    const managementFeesForPeriod =
        currentPrice * totalSupplyAfterDecimals * MANAGEMENT_FEE * (options.toTimestamp - options.fromTimestamp) / ONE_YEAR_IN_SECONDS;

    dailyFees.addUSDValue(managementFeesForPeriod, 'Management Fees - BCAP');

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
}

const methodology = {
    Fees: "Includes 2.5% management fees collected by the protocol",
    Revenue: "Includes 2.5% management fees collected by the protocol",
    ProtocolRevenue: "Includes 2.5% management fees collected by the protocol",
};

const breakdownMethodology = {
    Fees: {
        'Management Fees - BCAP': "2.5% management fees collected by the protocol",
    },
    Revenue: {
        'Management Fees - BCAP': "2.5% management fees collected by the protocol",
    },
    ProtocolRevenue: {
        'Management Fees - BCAP': "2.5% management fees collected by the protocol",
    },
};

const adapter: SimpleAdapter = {
    version: 1, //oracle price updates once a day
    fetch,
    breakdownMethodology,
    methodology,
    chains: [CHAIN.ERA],
    start: '2025-03-08'
};

export default adapter;
