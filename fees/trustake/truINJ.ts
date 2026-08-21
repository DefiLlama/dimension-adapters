/*import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";
import { PROTOCOL_FEE_RATE, SUPPLY_SIDE_RATE } from "./shared";

const TRUINJ_CONTRACT = "inj1x997dy6ka7y8u0r56yk2k83llspy33yet9zcnq";
const INJ_LCD = "https://lcd.injective.network";
const INJ_BLOCK_TIME = 0.64; // seconds per block

async function injQueryAtHeight(queryMsg: object, height: number): Promise<any> {
  const encoded = Buffer.from(JSON.stringify(queryMsg)).toString("base64");
  const res = await httpGet(
    `${INJ_LCD}/cosmwasm/wasm/v1/contract/${TRUINJ_CONTRACT}/smart/${encoded}?height=${height}`
  );
  return res.data;
}

export const fetchTruINJ = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const latest = await httpGet(`${INJ_LCD}/cosmos/base/tendermint/v1beta1/blocks/latest`);
  const latestHeight = Number(latest.block.header.height);
  const latestTs = Math.floor(new Date(latest.block.header.time).getTime() / 1000);

  const heightBefore = Math.max(1, latestHeight - Math.floor((latestTs - options.fromTimestamp) / INJ_BLOCK_TIME));
  const heightAfter = Math.max(1, latestHeight - Math.floor((latestTs - options.toTimestamp) / INJ_BLOCK_TIME));

  const [stakedBefore, stakedAfter, supplyBefore, supplyAfter] = await Promise.all([
    injQueryAtHeight({ get_total_staked: {} }, heightBefore),
    injQueryAtHeight({ get_total_staked: {} }, heightAfter),
    injQueryAtHeight({ get_total_supply: {} }, heightBefore),
    injQueryAtHeight({ get_total_supply: {} }, heightAfter),
  ]);

  const totalStakedBefore = BigInt(stakedBefore.total_staked);
  const totalStakedAfter = BigInt(stakedAfter.total_staked);
  const truINJSupplyBefore = BigInt(supplyBefore.total_supply);
  const truINJSupplyAfter = BigInt(supplyAfter.total_supply);

  // Cross-multiply to compute yield without precision loss
  const stakingRewardsRaw = (totalStakedAfter * truINJSupplyBefore - totalStakedBefore * truINJSupplyAfter) / truINJSupplyAfter;

  if (stakingRewardsRaw <= 0n) return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };

  const stakingRewardsINJ = Number(stakingRewardsRaw) / 1e18;
  const grossYield = stakingRewardsINJ / SUPPLY_SIDE_RATE;
  const protocolRevenue = grossYield * PROTOCOL_FEE_RATE;

  dailyFees.addCGToken("injective-protocol", grossYield, METRIC.STAKING_REWARDS);
  dailySupplySideRevenue.addCGToken("injective-protocol", stakingRewardsINJ, METRIC.STAKING_REWARDS);
  dailyRevenue.addCGToken("injective-protocol", protocolRevenue, METRIC.SERVICE_FEES);
  dailyProtocolRevenue.addCGToken("injective-protocol", protocolRevenue, METRIC.SERVICE_FEES);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};
*/