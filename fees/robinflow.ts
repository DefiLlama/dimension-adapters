import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const LABELS = {
  VESTING_LOCK_CREATION_FEES: "Vesting and Lock Fees",
} as const;

const FEE_PAID_EVENT = "event FeePaid(address indexed payer, uint256 amount)";

const chainConfig: Record<string, { start: string; streams: string }> = {
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-08",
    // Source: RobinFlow app config and Blockscout-verified RobinFlowStreams deployment.
    streams: "0x3068bF0522d721e674aB9A252fDC50bB614b3caE",
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const { streams } = chainConfig[options.chain];

  const logs = await options.getLogs({
    target: streams,
    eventAbi: FEE_PAID_EVENT,
  });

  for (const log of logs) {
    dailyFees.addGasToken(log.amount, LABELS.VESTING_LOCK_CREATION_FEES);
    dailyRevenue.addGasToken(log.amount, LABELS.VESTING_LOCK_CREATION_FEES);
    dailyProtocolRevenue.addGasToken(log.amount, LABELS.VESTING_LOCK_CREATION_FEES);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: "Fees paid to create vesting and lock streams.",
  Revenue: "All vesting and lock stream fees kept by the protocol.",
  ProtocolRevenue: "All vesting and lock stream fees kept by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.VESTING_LOCK_CREATION_FEES]: "Fees paid when vesting or lock streams are created.",
  },
  Revenue: {
    [LABELS.VESTING_LOCK_CREATION_FEES]: "Vesting and lock stream fees kept by the protocol.",
  },
  ProtocolRevenue: {
    [LABELS.VESTING_LOCK_CREATION_FEES]: "Vesting and lock stream fees kept by the protocol.",
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
