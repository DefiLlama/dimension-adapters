import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const OVERSEER = "0xB96f07367e69e86d6e9C3F29215885104813eeAE";
const BIPS = BigInt(10000);

const METRIC = {
  StakingRewards: "HYPE Staking Rewards",
  StakingRewardsToTreasury: "HYPE Staking Rewards To Treasury",
  StakingRewardsToHolders: "HYPE Staking Rewards To stHYPE Holders",
};

const rebaseEvent =
  "event Rebase(uint256 currentSupply, uint256 newSupply, uint256 rebaseInterval, int256 indexed apr, uint256 indexed currentShareRate, uint256 indexed timeElapsed)";
const protocolFeeSetEvent = "event ProtocolFeeSet(uint256 fee)";

const getArg = (log: any, key: string) => log.args?.[key] ?? log[key];

const sortLogs = (logs: any[]) => logs.sort((a, b) => {
  const blockDiff = Number(a.blockNumber ?? 0) - Number(b.blockNumber ?? 0);
  if (blockDiff !== 0) return blockDiff;
  return Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);
});

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let protocolFeeBps = BigInt(await options.fromApi.call({
    target: OVERSEER,
    abi: "uint256:protocolFee",
  }));

  const [rebases, protocolFeeUpdates] = await Promise.all([
    options.getLogs({
      target: OVERSEER,
      eventAbi: rebaseEvent,
      onlyArgs: false,
    }),
    options.getLogs({
      target: OVERSEER,
      eventAbi: protocolFeeSetEvent,
      onlyArgs: false,
    }),
  ]);

  const logs = sortLogs([
    ...rebases.map((log: any) => ({ ...log, eventType: "rebase" })),
    ...protocolFeeUpdates.map((log: any) => ({ ...log, eventType: "protocolFeeSet" })),
  ]);

  for (const log of logs) {
    if (log.eventType === "protocolFeeSet") {
      protocolFeeBps = BigInt(getArg(log, "fee"));
      continue;
    }

    const currentSupply = BigInt(getArg(log, "currentSupply"));
    const newSupply = BigInt(getArg(log, "newSupply"));
    if (newSupply <= currentSupply) continue;

    const supplySideRevenue = newSupply - currentSupply;
    const grossRewards = protocolFeeBps < BIPS
      ? supplySideRevenue * BIPS / (BIPS - protocolFeeBps)
      : supplySideRevenue;
    const protocolRevenue = grossRewards - supplySideRevenue;

    dailyFees.addGasToken(grossRewards, METRIC.StakingRewards);
    dailyRevenue.addGasToken(protocolRevenue, METRIC.StakingRewardsToTreasury);
    dailyProtocolRevenue.addGasToken(protocolRevenue, METRIC.StakingRewardsToTreasury);
    dailySupplySideRevenue.addGasToken(supplySideRevenue, METRIC.StakingRewardsToHolders);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Gross HYPE staking rewards earned by stHYPE before the protocol fee.",
  Revenue: "Protocol fee charged on positive stHYPE rebases.",
  ProtocolRevenue: "Protocol fee accrued by the stHYPE Overseer contract.",
  SupplySideRevenue: "Net HYPE staking rewards distributed to stHYPE holders through rebases.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.StakingRewards]: "Gross HYPE staking rewards earned by stHYPE before the protocol fee.",
  },
  Revenue: {
    [METRIC.StakingRewardsToTreasury]: "Protocol fee charged on positive stHYPE rebases and accrued by the Overseer contract.",
  },
  ProtocolRevenue: {
    [METRIC.StakingRewardsToTreasury]: "Protocol fee charged on positive stHYPE rebases and accrued by the Overseer contract.",
  },
  SupplySideRevenue: {
    [METRIC.StakingRewardsToHolders]: "Net HYPE staking rewards distributed to stHYPE holders through rebases.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-02-18",
  methodology,
  breakdownMethodology,
};

export default adapter;
