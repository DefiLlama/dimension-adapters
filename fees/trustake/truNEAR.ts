/*import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { httpPost } from "../../utils/fetchURL";
import { getEnv } from "../../helpers/env";
import { PROTOCOL_FEE_RATE, SUPPLY_SIDE_RATE } from "./shared";

const TRUNEAR_CONTRACT = "staker1.msig1.trufin.near";
const NEAR_RPC = getEnv("NEAR_RPC");

async function nearViewAtBlock(method: string, blockId: number): Promise<string> {
  const res = await httpPost(NEAR_RPC, {
    jsonrpc: "2.0", id: 1, method: "query",
    params: {
      request_type: "call_function",
      block_id: blockId,
      account_id: TRUNEAR_CONTRACT,
      method_name: method,
      args_base64: "e30=",
    },
  });
  return String.fromCharCode(...res.result.result);
}

export const fetchTruNEAR = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const latest = await httpPost(NEAR_RPC, {
    jsonrpc: "2.0", id: 1, method: "block", params: { finality: "final" },
  });
  const latestHeight: number = latest.result.header.height;
  const latestTs = Math.floor(Number(latest.result.header.timestamp) / 1e9);

  const blockBefore = Math.max(1, latestHeight - (latestTs - options.fromTimestamp));
  const blockAfter = Math.max(1, latestHeight - (latestTs - options.toTimestamp));

  const [supplyBeforeRaw, stakedBeforeRaw, supplyAfterRaw, stakedAfterRaw] = await Promise.all([
    nearViewAtBlock("ft_total_supply", blockBefore),
    nearViewAtBlock("get_total_staked", blockBefore),
    nearViewAtBlock("ft_total_supply", blockAfter),
    nearViewAtBlock("get_total_staked", blockAfter),
  ]);

  const truNEARSupplyBefore = BigInt(JSON.parse(supplyBeforeRaw));
  const truNEARSupplyAfter = BigInt(JSON.parse(supplyAfterRaw));
  const totalStakedBefore = BigInt(JSON.parse(stakedBeforeRaw)[0]);
  const totalStakedAfter = BigInt(JSON.parse(stakedAfterRaw)[0]);

  // Cross-multiply to compute yield without precision loss
  const stakingRewardsYocto = (totalStakedAfter * truNEARSupplyBefore - totalStakedBefore * truNEARSupplyAfter) / truNEARSupplyAfter;

  if (stakingRewardsYocto <= 0n) return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };

  const stakingRewardsNEAR = Number(stakingRewardsYocto) / 1e24;
  const grossYield = stakingRewardsNEAR / SUPPLY_SIDE_RATE;
  const protocolRevenue = grossYield * PROTOCOL_FEE_RATE;

  dailyFees.addCGToken("near", grossYield, METRIC.STAKING_REWARDS);
  dailySupplySideRevenue.addCGToken("near", stakingRewardsNEAR, METRIC.STAKING_REWARDS);
  dailyRevenue.addCGToken("near", protocolRevenue, METRIC.SERVICE_FEES);
  dailyProtocolRevenue.addCGToken("near", protocolRevenue, METRIC.SERVICE_FEES);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};
*/