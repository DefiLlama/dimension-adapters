import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

const FEE_COLLECTOR = "0x2dBe91FF25ABd5419435656a7bccD269EC358Ea4";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    await addTokensReceived({ options, target: FEE_COLLECTOR, balances: dailyFees, token: ADDRESSES.base.USDC })

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Fees: "Tiered fees on private shielded transactions: $0.05 base + 0.05% (<$1k), 0.08% ($1k-$10k), 0.10% (>$10k). Collected as USDC transfers to fee collector at shield time.",
    UserFees: "All fees are paid by users performing private shielded transactions.",
    Revenue: "100% of fees are protocol revenue.",
    ProtocolRevenue: "B402 receives 100% of collected fees.",
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE],
    start: "2026-02-20",
    methodology,
};

export default adapter;
