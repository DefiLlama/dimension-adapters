import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const LABELS = {
  TRADING_FEES: "Creator Key Trading Fees",
  TRADING_FEES_TO_CREATORS: "Creator Key Trading Fees To Creators",
  TRADING_FEES_TO_REFERRERS: "Creator Key Trading Fees To Referrers",
} as const;

const chainConfig: Record<string, { start: string; trading: string }> = {
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-11",
    // Source: GreenTown public trade API tx receipts; proxy verified on Robinhood Blockscout.
    trading: "0x3ec694574a58db55aa594defdb0f3bb8bca5f5b4",
  },
};

const TRADE_EVENT = "event TradeFractionalShares(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 amount, uint256 protocolAmount, uint256 subjectAmount, uint256 referralAmount, uint256 fractionalSupply, uint256 buyPrice, uint256 myFractionalShares)"

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const { trading } = chainConfig[options.chain];
  const logs = await options.getLogs({
    target: trading,
    eventAbi: TRADE_EVENT,
  });

  for (const log of logs) {
    const tradeAmount = log.amount;
    const protocolFee = log.protocolAmount;
    const creatorFee = log.subjectAmount;
    const referrerFee = log.referralAmount;
    const totalFee = protocolFee + creatorFee + referrerFee;

    dailyVolume.addGasToken(tradeAmount);
    dailyFees.addGasToken(totalFee, LABELS.TRADING_FEES);
    dailyUserFees.addGasToken(totalFee, LABELS.TRADING_FEES);
    dailyRevenue.addGasToken(protocolFee, LABELS.TRADING_FEES);
    dailyProtocolRevenue.addGasToken(protocolFee, LABELS.TRADING_FEES);
    dailySupplySideRevenue.addGasToken(creatorFee, LABELS.TRADING_FEES_TO_CREATORS);
    dailySupplySideRevenue.addGasToken(referrerFee, LABELS.TRADING_FEES_TO_REFERRERS);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "ETH traded through GreenTown creator keys.",
  Fees: "Trading fees paid on GreenTown creator key buys and sells.",
  UserFees: "Trading fees paid by GreenTown users.",
  Revenue: "The protocol share of GreenTown trading fees.",
  ProtocolRevenue: "The protocol share of GreenTown trading fees.",
  SupplySideRevenue: "Creator and referrer shares of GreenTown trading fees.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.TRADING_FEES]: "Trading fees paid on creator key buys and sells.",
  },
  UserFees: {
    [LABELS.TRADING_FEES]: "Trading fees paid by GreenTown users.",
  },
  Revenue: {
    [LABELS.TRADING_FEES]: "Protocol share of GreenTown trading fees.",
  },
  ProtocolRevenue: {
    [LABELS.TRADING_FEES]: "Protocol share of GreenTown trading fees.",
  },
  SupplySideRevenue: {
    [LABELS.TRADING_FEES_TO_CREATORS]: "Creator share of GreenTown trading fees.",
    [LABELS.TRADING_FEES_TO_REFERRERS]: "Referrer share of GreenTown trading fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
