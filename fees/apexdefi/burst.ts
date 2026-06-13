import { Chain } from "../../adapters/types";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";
import { METRIC } from "../../helpers/metrics";

type TAddress = {
  [s: string | Chain]: string;
};

type BurstSwap = {
  token: string;
  sender: string;
  amount0In: string; // Token
  amount0Out: string; // Token
  amount1In: string; // Native
  amount1Out: string; // Native
};

type CurveComplete = {
  token0: string; // Token
  dist: string; // Distributor
  launchFee: string;
  creatorRewards: string;
};

const BURST_FACTORIES: TAddress = {
  [CHAIN.BASE]: "0x1FE488479873Bc76e5D69F612f155714c20C0DCF",
  [CHAIN.AVAX]: "0xBc74A3C24d8aA980445ADc889577E29089c07CDD",
};

const scaleFactor = BigInt(10000);
const burstSwapFee = BigInt(25); // 0.25%
const burstFactoryFee = BigInt(75); // 0.75%

export async function burstMetrics(options: FetchOptions): Promise<{
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailyProtocolRevenue: Balances;
  dailyVolume: Balances;
}> {
  const { createBalances } = options;

  let dailyFees = createBalances();
  let dailyRevenue = createBalances();
  let dailyProtocolRevenue = createBalances();
  let dailyVolume = createBalances();

  const curveCompleteLogs = await options.getLogs({
    target: BURST_FACTORIES[options.chain],
    eventAbi:
      "event CurveCompleted(address indexed token0, address indexed dist, uint256 launchFee, uint256 creatorRewards)",
  });

  const swapLogs = await options.getLogs({
    targets: [BURST_FACTORIES[options.chain]],
    eventAbi:
      "event BurstSwap(address indexed token, address indexed sender, uint256 amount0In, uint256 amount0Out, uint256 amount1In, uint256 amount1Out)",
  });

  curveCompleteLogs.map((log: CurveComplete) => {
    const launchFeeAmount = BigInt(log.launchFee);
    const creatorRewardsAmount = BigInt(log.creatorRewards);
    dailyFees.addGasToken(launchFeeAmount, "Launch fees");
    dailyFees.addGasToken(creatorRewardsAmount, METRIC.CREATOR_FEES);
    dailyRevenue.addGasToken(launchFeeAmount, "Launch fees");
    dailyProtocolRevenue.addGasToken(launchFeeAmount, "Launch fees");
  });

  swapLogs.map((log: BurstSwap) => {
    const nativeAmount = BigInt(log.amount1In) + BigInt(log.amount1Out);
    const fee = (nativeAmount * burstSwapFee) / scaleFactor;
    const protocolRevenue = (nativeAmount * burstFactoryFee) / scaleFactor;
    dailyFees.addGasToken(fee, "Burst swap fees");
    dailyFees.addGasToken(protocolRevenue, "Burst protocol fees");
    dailyRevenue.addGasToken(protocolRevenue, "Burst protocol fees");
    dailyProtocolRevenue.addGasToken(protocolRevenue, "Burst protocol fees");
    dailyVolume.addGasToken(nativeAmount);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyVolume,
  };
}
