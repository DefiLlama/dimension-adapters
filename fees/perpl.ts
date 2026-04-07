import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const EXCHANGE = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F";

const MakerOrderFilledEvent =
    "event MakerOrderFilled(uint256 perpId, uint256 accountId, uint256 orderId, uint256 pricePNS, uint256 lotLNS, uint256 feeCNS, uint256 lockedBalanceCNS, int256 amountCNS, uint256 balanceCNS)";

const TakerOrderFilledEvent =
    "event TakerOrderFilled(uint256 entryPricePNS, uint256 perpId, uint256 accountId, uint256 lotLNS, uint256 feeCNS, uint256 lockedBalanceCNS, int256 amountCNS, uint256 balanceCNS)";

const fetch = async ({ getLogs }: FetchOptions) => {
    const [makerLogs, takerLogs] = await Promise.all([
        getLogs({ target: EXCHANGE, eventAbi: MakerOrderFilledEvent }),
        getLogs({ target: EXCHANGE, eventAbi: TakerOrderFilledEvent }),
    ]);

    let dailyFees = 0;
    for (const log of makerLogs) {
        dailyFees += Number(log.feeCNS) / 1e6;
    }
    for (const log of takerLogs) {
        dailyFees += Number(log.feeCNS) / 1e6;
    }

    // All fees go to protocol (insurance fund + protocol balance)
    // No LP rewards, referrals, or token holder distributions
    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
        dailySupplySideRevenue: 0,
        dailyHoldersRevenue: 0,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.MONAD]: {
            fetch,
            start: "2026-02-12",
        },
    },
    methodology: {
        Fees: "Trading fees paid by makers and takers on each fill.",
        Revenue: "All fees are retained by the protocol (insurance fund + protocol balance).",
        ProtocolRevenue: "100% of trading fees go to the protocol.",
        SupplySideRevenue: "Perpl is an order-book DEX with no LP fee sharing.",
        HoldersRevenue: "No token holder fee distribution.",
    },
};

export default adapter;
