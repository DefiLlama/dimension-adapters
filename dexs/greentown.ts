import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const LABELS = {
  TRADING_FEES: "Creator Key Trading Fees",
  TRADING_FEES_TO_CREATORS: "Creator Key Trading Fees To Creators",
  TRADING_FEES_TO_REFERRERS: "Creator Key Trading Fees To Referrers",
} as const;

const TRADE_TOPIC = "0x7d26fca21642884249fe04718e734992f6e00b24a015ddfbd8018e2639417b56";

const chainConfig: Record<string, { start: string; trading: string }> = {
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-11",
    // Source: GreenTown public trade API tx receipts; proxy verified on Robinhood Blockscout.
    trading: "0x3ec694574a58db55aa594defdb0f3bb8bca5f5b4",
  },
};

const getWord = (data: string, index: number) => BigInt(`0x${data.slice(2 + index * 64, 66 + index * 64)}`);

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
    topics: [TRADE_TOPIC],
    onlyArgs: false,
  });

  for (const log of logs) {
    // ABI is not verified; field order is confirmed from GreenTown API tx receipts.
    const tradeAmount = getWord(log.data, 4);
    const protocolFee = getWord(log.data, 5);
    const creatorFee = getWord(log.data, 6);
    const referrerFee = getWord(log.data, 7);
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
