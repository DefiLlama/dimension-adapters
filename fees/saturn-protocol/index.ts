import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const USDAT = "0x23238f20b894f29041f48D88eE91131C395Aaa71";
const sUSDat = "0xD166337499E176bbC38a1FBd113Ab144e5bd2Df7";
const STRC_ORACLE = "0x5f7eCD0D045c393da6cb6c933c671AC305A871BF";

const BALANCE_DECIMALS = 6;

const BPS = 10000;
const PERFORMANCE_FEE_BPS = 1000;
const STAKER_SHARE_BPS = 1000; // Saturn passes 10% of revenue through to sUSDat stakers (supply side)

const METRICS = {
    STRC_PRICE_FLUCTUATIONS: "Effect of STRC price fluctuations",
    STRC_PERFORMANCE_FEE: "Performance fee on STRC rewards",
    STRC_YIELD_TO_STAKERS: "STRC rewards to stakers",
    USDAT_PERFORMANCE_FEE: "Performance fee on Tbill Yields",
    USDAT_YIELD_TO_STAKERS: "Tbill yields to stakers",
    USDAT_YIELD_TO_PROTOCOL: "Tbill yields to protocol",
    REVENUE_SHARE_TO_STAKERS: "Revenue share passed to sUSDat stakers",
}

// Sources:
// - USDat / sUSDat docs: https://saturncredit.gitbook.io/saturn-docs/solution
// - Fee and reserve docs: https://saturncredit.gitbook.io/saturn-docs/operations-and-governance/protocol-fee-and-risk-reserve
// - Verified contracts: https://etherscan.io/address/0xD166337499E176bbC38a1FBd113Ab144e5bd2Df7#code
// - M0 JMI yield model: https://docs.m0.org/build/models/treasury/jmi/overview/
const Event = {
    Deposit: "event Deposit(address indexed sender,address indexed owner,uint256 assets,uint256 shares)",
    RewardsReceived: "event RewardsReceived(uint256 amount,uint256 newVestingAmount)",
    YieldClaimed: "event YieldClaimed(uint256 amount)",
};
const ABI = {
    depositFeeBps: "uint256:depositFeeBps",
    getPrice: "function getPrice() view returns (uint256 price, uint8 priceDecimals)",
};

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const [depositLogs, strcRewardLogs, usdatYieldLogs] = await Promise.all([
        options.getLogs({ target: sUSDat, eventAbi: Event.Deposit }),
        options.getLogs({ target: sUSDat, eventAbi: Event.RewardsReceived }),
        options.getLogs({ target: USDAT, eventAbi: Event.YieldClaimed }),
    ]);

    if (depositLogs.length) {
        const feeBps = await options.api.call({ target: sUSDat, abi: ABI.depositFeeBps });
        if (feeBps) {
            depositLogs.forEach((log: any) => {
                // Deposit.assets is net of fees, so gross up the net amount to recover the deposit fee.
                const denominator = BPS - feeBps;
                const fee = Number(log.assets) * feeBps / denominator;
                dailyFees.add(USDAT, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
                dailyRevenue.add(USDAT, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
            });
        }
    }

    const [strcBalanceBackingSUSDat, usdatBalanceBackingSUSDat, usdatTotalSupply] = await Promise.all([
        options.api.call({
            target: sUSDat,
            abi: 'uint256:strcBalance',
        }),
        options.api.call({
            target: sUSDat,
            abi: 'uint256:usdatBalance',
        }),
        options.api.call({
            target: USDAT,
            abi: 'uint256:totalSupply',
        }),
    ])

    const [strcDataBefore, strcDataAfter] = await Promise.all([
        options.fromApi.call({
            target: STRC_ORACLE,
            abi: ABI.getPrice,
        }),
        options.toApi.call({
            target: STRC_ORACLE,
            abi: ABI.getPrice,
        }),
    ])

    const strcPriceBefore = Number(strcDataBefore.price) / (10 ** Number(strcDataBefore.priceDecimals));
    const strcPriceAfter = Number(strcDataAfter.price) / (10 ** Number(strcDataAfter.priceDecimals));

    const strcPriceDelta = (strcPriceAfter - strcPriceBefore);
    const strcBalance = strcBalanceBackingSUSDat / (10 ** BALANCE_DECIMALS)

    // STRC price moves are unrealized mark-to-market on the backing, so they accrue to
    // sUSDat stakers (supply side) only -- not booked as realized protocol fees.
    dailySupplySideRevenue.addUSDValue(strcPriceDelta * strcBalance, METRICS.STRC_PRICE_FLUCTUATIONS);

    strcRewardLogs.forEach((log: any) => {
        // `amount` is the raw STRC reward (6 dec) passed to transferInRewards(strcAmount).
        const strcYield = (Number(log.amount) / 10 ** BALANCE_DECIMALS) * (strcPriceAfter);
        // 10% performance fee on gross yield (Saturn docs); mirror the USDat block below.
        const protocolFee = strcYield * PERFORMANCE_FEE_BPS / BPS;

        dailyFees.addUSDValue(strcYield, 'Asset yields - STRC');
        dailyRevenue.addUSDValue(protocolFee, METRICS.STRC_PERFORMANCE_FEE);
        dailySupplySideRevenue.addUSDValue(strcYield - protocolFee, METRICS.STRC_YIELD_TO_STAKERS);
    })

    const usdatYieldRatioToStakers = usdatTotalSupply ? usdatBalanceBackingSUSDat / usdatTotalSupply : 0;

    usdatYieldLogs.forEach((log: any) => {
        const yieldShareOfStakers = Number(log.amount) * usdatYieldRatioToStakers;
        const performanceFee = yieldShareOfStakers * PERFORMANCE_FEE_BPS / BPS;
        const actualYieldToStakers = yieldShareOfStakers - performanceFee;
        const yieldToProtocol = Number(log.amount) - yieldShareOfStakers;

        dailyFees.add(USDAT, Number(log.amount), 'Asset yields - Tbill');
        dailyRevenue.add(USDAT, performanceFee, METRICS.USDAT_PERFORMANCE_FEE);
        dailyRevenue.add(USDAT, yieldToProtocol, METRICS.USDAT_YIELD_TO_PROTOCOL);
        dailySupplySideRevenue.add(USDAT, actualYieldToStakers, METRICS.USDAT_YIELD_TO_STAKERS);
    })

    // sUSDat is a staking token, not a governance token, so the share Saturn passes back to
    // sUSDat holders is supply-side revenue (USDat stakers), not holders revenue. Saturn keeps 90%.
    const stakerShare = dailyRevenue.clone(STAKER_SHARE_BPS / BPS);
    dailySupplySideRevenue.addBalances(stakerShare, METRICS.REVENUE_SHARE_TO_STAKERS);
    const protocolRevenue = dailyRevenue.clone((BPS - STAKER_SHARE_BPS) / BPS);

    return {
        dailyFees,
        dailyRevenue: protocolRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: protocolRevenue,
    };
};

const methodology = {
    Fees: "Total inflows: sUSDat deposit fees, STRC dividend yields, and Tbill yields generated through the M0 yield model.",
    Revenue: "Saturn's net revenue: sUSDat deposit fees and the 10% performance fee on sUSDat yield, after passing 10% of revenue through to sUSDat stakers.",
    ProtocolRevenue: "Saturn keeps 90% of revenue (sUSDat deposit fees and 10% performance fee on sUSDat yield); the remaining 10% is passed through to sUSDat stakers as supply-side revenue.",
    SupplySideRevenue: "Yield accruing to sUSDat stakers: STRC price movements and dividends, Tbill yields, plus the 10% of revenue Saturn passes through to stakers.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Fees paid when users deposit USDat into sUSDat.",
        'Asset yields - STRC': "Yields from STRC dividends",
        'Asset yields - Tbill': "Yields from Tbill through M0 yield model",
    },
    Revenue: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit fees kept by Saturn.",
        [METRICS.STRC_PERFORMANCE_FEE]: "Performance fee on STRC rewards",
        [METRICS.USDAT_PERFORMANCE_FEE]: "Performance fee on Tbill Yields",
        [METRICS.USDAT_YIELD_TO_PROTOCOL]: "Yields from Tbill gained through M0 yield model, which dont back sUSDat",
    },
    ProtocolRevenue: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Deposit fees kept by Saturn.",
        [METRICS.STRC_PERFORMANCE_FEE]: "Performance fee on STRC rewards",
        [METRICS.USDAT_PERFORMANCE_FEE]: "Performance fee on Tbill Yields",
        [METRICS.USDAT_YIELD_TO_PROTOCOL]: "Yields from Tbill gained through USDAT which dont back sUSDat",
    },
    SupplySideRevenue: {
        [METRICS.STRC_PRICE_FLUCTUATIONS]: "Effect of STRC price fluctuations on sUSDat",
        [METRICS.STRC_YIELD_TO_STAKERS]: "Yields from STRC dividends to USDAT stakers",
        [METRICS.USDAT_YIELD_TO_STAKERS]: "Yields from Tbill through M0 yield model to USDAT stakers",
        [METRICS.REVENUE_SHARE_TO_STAKERS]: "10% of Saturn revenue passed through to sUSDat stakers",
    },
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.ETHEREUM],
    start: "2026-03-10",
    fetch,
    methodology,
    breakdownMethodology,
    allowNegativeValue: true,
    doublecounted: true
};

export default adapter;
