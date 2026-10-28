import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const STAKED_TD = "0x0CB091e6D9fd696b4CC8571E19e042F456c182Ad";
const USDC = ADDRESSES.base.USDC;

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

  const profitDelta = BigInt(totalProfitAfter) - BigInt(totalProfitBefore);

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

  const rawNum = profitNumerator != null ? BigInt(profitNumerator) : 0n;
  const rawDen = profitDenominator != null ? BigInt(profitDenominator) : 0n;

  const bothValid = rawNum > 0n && rawDen > 0n;
  const feeNum = bothValid ? rawNum : 100n;
  const feeDen = bothValid ? rawDen : 1000n;

  const totalYield = profitDelta * feeDen / feeNum;
  
  dailyFees.add(USDC, totalYield / BigInt(1e12), 'Staking Yield');
  dailyRevenue.add(USDC, profitDelta / BigInt(1e12), 'Staking Yield To Protocol');
  dailySupplySideRevenue.add(USDC, (totalYield - profitDelta) / BigInt(1e12), 'Staking Yield To Stakers');

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

const breakdownMethodology = {
  Fees: {
    'Staking Yield': "Total yield from TD staking rewards distributed via addYield().",
  },
  Revenue: {
    'Staking Yield To Protocol': "Protocol's profit cut (profitNumerator / profitDenominator of yield), sent to profitRecipient.",
  },
  SupplySideRevenue: {
    'Staking Yield To Stakers': "Yield distributed to stTD stakers after deducting protocol profit.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-03-20",
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
  pullHourly: true,
};

export default adapter;
