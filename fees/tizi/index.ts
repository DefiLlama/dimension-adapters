import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const STAKED_TD = "0x0CB091e6D9fd696b4CC8571E19e042F456c182Ad";
const USDC = ADDRESSES.base.USDC;

// TD (18 decimals) → USDC (6 decimals): divide by 1e12
const TD_TO_USDC = 1e12;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const totalProfitBefore = await options.fromApi.call({
    target: STAKED_TD,
    abi: "uint256:totalProfit",
  });
  const totalProfitAfter = await options.toApi.call({
    target: STAKED_TD,
    abi: "uint256:totalProfit",
  });

  const profitDelta = Number(totalProfitAfter) - Number(totalProfitBefore);

  if (profitDelta > 0) {
    const profitNumerator = await options.toApi.call({
      target: STAKED_TD,
      abi: "uint256:profitNumerator",
      permitFailure: true,
    });
    const profitDenominator = await options.toApi.call({
      target: STAKED_TD,
      abi: "uint256:profitDenominator",
      permitFailure: true,
    });

    const feeRate = (profitNumerator && profitDenominator)
      ? Number(profitNumerator) / Number(profitDenominator)
      : 0.1;

    const totalYield = profitDelta / feeRate;

    dailyFees.add(USDC, totalYield / TD_TO_USDC);
    dailyRevenue.add(USDC, profitDelta / TD_TO_USDC);
    dailySupplySideRevenue.add(USDC, (totalYield - profitDelta) / TD_TO_USDC);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total staking yield generated from TD staking rewards.",
  Revenue: "Portion of yield claimed by the protocol (profitNumerator / profitDenominator, default 10%).",
  ProtocolRevenue: "All protocol profit is directed to the protocol's profitRecipient.",
  SupplySideRevenue: "Portion of yield distributed to stTD stakers (total yield minus protocol profit).",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-03-20",
  methodology,
};

export default adapter;
