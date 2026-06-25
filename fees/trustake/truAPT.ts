import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { view, getVersionFromTimestamp } from "../../helpers/aptos";
import { PROTOCOL_FEE_RATE, SUPPLY_SIDE_RATE } from "./shared";

const TRUSTAKE_APTOS_MODULE = "0x6f8ca77dd0a4c65362f475adb1c26ae921b1d75aa6b70e53d0e340efd7d8bc80";

export const fetchTruAPT = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [versionBefore, versionAfter] = await Promise.all([
    getVersionFromTimestamp(new Date(options.fromTimestamp * 1000)),
    getVersionFromTimestamp(new Date(options.toTimestamp * 1000)),
  ]);

  const [priceBefore, priceAfter, sharesResult, scalingResult] = await Promise.all([
    view<[string, string]>(`${TRUSTAKE_APTOS_MODULE}::staker::share_price`, [], [], versionBefore),
    view<[string, string]>(`${TRUSTAKE_APTOS_MODULE}::staker::share_price`, [], [], versionAfter),
    view<[string]>(`${TRUSTAKE_APTOS_MODULE}::staker::total_shares`, [], [], versionBefore),
    view<[string]>(`${TRUSTAKE_APTOS_MODULE}::staker::share_price_scaling_factor`),
  ]);

  const scalingFactor = BigInt(scalingResult[0]);
  const sharePriceNumBefore = BigInt(priceBefore[0]);
  const sharePriceDenBefore = BigInt(priceBefore[1]);
  const sharePriceNumAfter = BigInt(priceAfter[0]);
  const sharePriceDenAfter = BigInt(priceAfter[1]);
  const totalTruAPTShares = BigInt(sharesResult[0]);

  const rewardsNumerator = totalTruAPTShares * (sharePriceNumAfter * sharePriceDenBefore - sharePriceNumBefore * sharePriceDenAfter);
  const rewardsDenominator = sharePriceDenAfter * sharePriceDenBefore * scalingFactor;

  if (rewardsNumerator <= 0n) return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };

  const stakingRewardsOctas = rewardsNumerator / rewardsDenominator;
  const stakingRewardsAPT = Number(stakingRewardsOctas) / 1e8;
  const grossYield = stakingRewardsAPT / SUPPLY_SIDE_RATE;
  const protocolRevenue = grossYield * PROTOCOL_FEE_RATE;

  dailyFees.addCGToken("aptos", grossYield, METRIC.STAKING_REWARDS);
  dailySupplySideRevenue.addCGToken("aptos", stakingRewardsAPT, METRIC.STAKING_REWARDS);
  dailyRevenue.addCGToken("aptos", protocolRevenue, METRIC.SERVICE_FEES);
  dailyProtocolRevenue.addCGToken("aptos", protocolRevenue, METRIC.SERVICE_FEES);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};
