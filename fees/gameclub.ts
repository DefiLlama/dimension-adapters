import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

const MainContract = "0xC590Ab41e94F801c41c96Fa595f67D59B8C6A176";
const FeeCollector = "0xAa1E6F6f628F15C57a675B1f38cDcE8e26c58E15";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();

    await addTokensReceived({
        options,
        fromAdddesses: [MainContract],
        targets: [FeeCollector],
        token: ADDRESSES.bsc.USDT,
        balances: dailyFees,
    });

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Fees: "Users pay fees when they trade on GameClub prediction markets",
    Revenue: "All fees go to the protocol",
    ProtocolRevenue: "All fees go to the protocol",
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    methodology,
    chains: [CHAIN.BSC],
    fetch,
    start: "2026-04-01",
};

export default adapter;
