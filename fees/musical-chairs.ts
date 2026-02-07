import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const chainsConfig: any = {
    [CHAIN.ARBITRUM]: {
        factory: "0xEDA164585a5FF8c53c48907bD102A1B593bd17eF",
        start: "2025-07-12"
    },
    [CHAIN.ETHEREUM]: {
        factory: "0x7c01A2a7e9012A98760984F2715A4517AD2c549A",
        start: "2026-01-29"
    },
    [CHAIN.BASE]: {
        factory: "0xEDA164585a5FF8c53c48907bD102A1B593bd17eF",
        start: "2026-01-22",
    },
};

const abi = {
    GameDeposit: "event GameDeposit(uint256 indexed gameId, address indexed player, uint256 indexed amount)",
    GameResultsRecorded: "event GameResultsRecorded(uint256 indexed gameId, address[] winners, address loser, uint256 amountPerWinner)",
    ReferralCommissionPaid: "event ReferralCommissionPaid(address indexed referrer, uint256 indexed gameId, uint256 amount)"
};

const fetch = async (options: FetchOptions) => {

    const totalDeposits = options.createBalances();
    const totalWinnings = options.createBalances();
    const totalReferralCommission = options.createBalances();

    const factory = chainsConfig[options.chain].factory;

    const gameDepositLogs = await options.getLogs({
        target: factory,
        eventAbi: abi.GameDeposit,
    });

    const gameResultsRecordedLogs = await options.getLogs({
        target: factory,
        eventAbi: abi.GameResultsRecorded,
    });

    const referralCommissionPaidLogs = await options.getLogs({
        target: factory,
        eventAbi: abi.ReferralCommissionPaid,
    });

    gameDepositLogs.forEach((log: any) => {
        totalDeposits.addGasToken(log.amount);
    });

    gameResultsRecordedLogs.forEach((log: any) => {
        totalWinnings.addGasToken(Number(log.winners.length) * Number(log.amountPerWinner));
    });

    referralCommissionPaidLogs.forEach((log: any) => {
        totalReferralCommission.addGasToken(log.amount);
    });

    const dailyFees = totalDeposits.clone();
    dailyFees.subtract(totalWinnings);
    const dailyRevenue = dailyFees.clone();
    dailyRevenue.subtract(totalReferralCommission);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue: totalReferralCommission,
    };
};

const methodology = {
    Fees: "Comission from total deposits.",
    Revenue: "Comission from total deposits post referral bonuses.",
    ProtocolRevenue: "Comission from total deposits post referral bonuses.",
    SupplySideRevenue: "Referral bonuses paid out to referrers.",
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    adapter: chainsConfig,
    methodology,
    allowNegativeValue: true, //in case event recorded next day, but game ended the previous day
};

export default adapter;
