import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const CONTRACT = "0xf3393dC9E747225FcA0d61BfE588ba2838AFb077";

const TRADE_EVENT_ABI =
    "event Trade(address indexed trader, uint256 indexed playerId, bool isBuy, uint256 amountInUnits, uint256 priceInWei, uint256 feeInWei, uint256 newSupplyInUnits, bool isIPOWindow)";

const REFERRAL_FEE_PAID_ABI =
    "event ReferralFeePaid(address indexed referrer, address indexed user, uint256 amountInWei)";

const ETH_PRIZE_DEPOSITED_ABI =
    "event EthPrizeDeposited(uint256 amountInWei)";

// Trade.feeInWei carries the total user-paid fee on every fee-generating path
// (IPO buy + all sells). UserSharesChanged.totalFeesInWei is emitted 1:1 with
// each Trade and carries the same value, so summing Trade.feeInWei captures
// all fees without double-counting.
//
// Fee flow:
//   fees = prizePool + protocolTreasury + referrer(optional)
// Events used for the split:
//   EthPrizeDeposited   -> prize pool inflow (holders revenue)
//   ReferralFeePaid     -> actual referrer payouts (supply-side revenue)
//     (if referrer transfer fails the amount is redirected to protocol and
//      ReferralFeeRedirectedToProtocol is emitted instead — correctly
//      excluded from supplySideRevenue)
//   Protocol treasury   -> fees - prize - referral

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const [tradeLogs, referralLogs, prizeLogs] = await Promise.all([
        options.getLogs({ target: CONTRACT, eventAbi: TRADE_EVENT_ABI }),
        options.getLogs({ target: CONTRACT, eventAbi: REFERRAL_FEE_PAID_ABI }),
        options.getLogs({ target: CONTRACT, eventAbi: ETH_PRIZE_DEPOSITED_ABI }),
    ]);

    for (const log of tradeLogs) {
        // Buy:  priceInWei is gross (includes IPO fees when active)
        // Sell: priceInWei is net; gross = priceInWei + feeInWei
        const fee = log.feeInWei;
        const grossVolume = log.isBuy ? log.priceInWei : log.priceInWei + fee;
        dailyVolume.addGasToken(grossVolume);
        dailyFees.addGasToken(fee, METRIC.TRADING_FEES);
    }

    for (const log of referralLogs) {
        dailySupplySideRevenue.addGasToken(log.amountInWei, 'Referral Rewards');
    }

    for (const log of prizeLogs) {
        dailySupplySideRevenue.addGasToken(log.amountInWei, 'Prize Pool Rewards');
    }

    const revenue = await dailyFees.getUSDValue() - await dailySupplySideRevenue.getUSDValue();
    dailyRevenue.addUSDValue(revenue, METRIC.PROTOCOL_FEES);

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
    Fees: "Total fees paid by traders, includes buy and sell fees",
    UserFees: "Trading fees paid by users",
    Revenue: "Part of fees retained by the protocol",
    ProtocolRevenue: "All the revenue goes to the protocol",
    SupplySideRevenue: "Includes referral rewards and prize pool rewards",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "Trading fees paid by users",
    },
    UserFees: {
        [METRIC.TRADING_FEES]: "Trading fees paid by users",
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "Part of fees retained by the protocol",
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "All the revenue goes to the protocol",
    },
    SupplySideRevenue: {
        'Referral Rewards': "Referral rewards paid to referrers",
        'Prize Pool Rewards': "Prize pool rewards paid to users holding fractional shares of football players",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.MEGAETH],
    start: "2026-01-11",
    methodology,
    breakdownMethodology,
    allowNegativeValue: true, //when prize pool + referral rewards exceed fees
};

export default adapter;
