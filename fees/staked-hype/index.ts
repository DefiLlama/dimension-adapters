import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const OVERSEER = "0xB96f07367e69e86d6e9C3F29215885104813eeAE";
const BPS = 10000n;

const EVENTS = {
  rebase: "event Rebase(uint256 currentSupply, uint256 newSupply, uint256 rebaseInterval, int256 indexed apr, uint256 indexed currentShareRate, uint256 indexed timeElapsed)",
  protocolFeeSet: "event ProtocolFeeSet(uint256 fee)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let protocolFeeBps = BigInt(await options.fromApi.call({
    target: OVERSEER,
    abi: "uint256:protocolFee",
  }));

  const [rebases, protocolFeeUpdates] = await Promise.all([
    options.getLogs({
      target: OVERSEER,
      eventAbi: EVENTS.rebase,
      onlyArgs: false,
    }),
    options.getLogs({
      target: OVERSEER,
      eventAbi: EVENTS.protocolFeeSet,
      onlyArgs: false,
    }),
  ]);

  const logs = [
    ...rebases.map((log: any) => ({ ...log, type: "rebase" })),
    ...protocolFeeUpdates.map((log: any) => ({ ...log, type: "protocolFeeSet" })),
  ].sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber) || Number(a.logIndex) - Number(b.logIndex));

  for (const log of logs) {
    if (log.type === "protocolFeeSet") {
      protocolFeeBps = BigInt(log.args.fee);
      continue;
    }

    const currentSupply = BigInt(log.args.currentSupply);
    const newSupply = BigInt(log.args.newSupply);

    const supplySideRevenue = newSupply - currentSupply;
    const grossRewards = supplySideRevenue > 0 ? supplySideRevenue * BPS / (BPS - protocolFeeBps) : supplySideRevenue;
    const protocolRevenue = grossRewards - supplySideRevenue;

    dailyFees.addGasToken(grossRewards, METRIC.STAKING_REWARDS);
    dailyRevenue.addGasToken(protocolRevenue, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.addGasToken(supplySideRevenue, METRIC.STAKING_REWARDS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-02-18",
  methodology: {
    Fees: "Gross HYPE staking rewards earned by stHYPE before the protocol fee.",
    Revenue: "Protocol fee charged on stHYPE rebases.",
    ProtocolRevenue: "Protocol fee accrued by the stHYPE Overseer contract.",
    SupplySideRevenue: "Net HYPE staking rewards distributed to stHYPE holders through rebases.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "Gross HYPE staking rewards earned by stHYPE before the protocol fee.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol fee charged on stHYPE rebases and accrued by the Overseer contract.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol fee charged on stHYPE rebases and accrued by the Overseer contract.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "Net HYPE staking rewards distributed to stHYPE holders through rebases.",
    },
  },
  allowNegativeValue: true,
};

export default adapter;
