import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const LHYPE = {
  shareToken: "0x5748ae796AE46A4F1348a1693de4b50560485562",
  accountant: "0xcE621a3CA6F72706678cFF0572ae8d15e5F001c3",
  accountantAbi: "function getRate() view returns (uint256)",
  erDecimals: 1e18,
  shareDecimals: 1e18,
};

const BASE_COINGECKO_ID = "hyperliquid";

const FEE_SWITCH_TS = Math.floor(new Date('2025-10-17').getTime() / 1000)

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const shareBefore = await options.fromApi.call({ target: LHYPE.accountant, abi: LHYPE.accountantAbi, params: [] });
  const shareAfter = await options.toApi.call({ target: LHYPE.accountant, abi: LHYPE.accountantAbi, params: [] });
  const totalSharesRaw = await options.api.call({ target: LHYPE.shareToken, abi: "function totalSupply() view returns (uint256)" });

  const growthPerShare = Number(shareAfter - shareBefore) / LHYPE.erDecimals;

  if (growthPerShare > 0) {
    const grossRewards = Number(totalSharesRaw) * growthPerShare / LHYPE.shareDecimals;
    const perfFee = options.startOfDay >= FEE_SWITCH_TS ? 0.2 : 0;
    const protocolRevenue = grossRewards * perfFee;
    const supplySideRevenue = grossRewards - protocolRevenue;

    dailyFees.addCGToken(BASE_COINGECKO_ID, grossRewards);
    dailyRevenue.addCGToken(BASE_COINGECKO_ID, protocolRevenue);
    dailySupplySideRevenue.addCGToken(BASE_COINGECKO_ID, supplySideRevenue);
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
  methodology: {
    Fees: "Staking rewards and fees accumulated on the strategy pools and vaults.",
    Revenue: "20% of staking rewards and fees for Looping Collective.",
    ProtocolRevenue: "20% of staking rewards and fees for Looping Collective.",
    SupplySideRevenue: "80% of yield distributed to LHYPE depositors after fee switch(100% before 17th october 2025).",
  },
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-02-18",
};

export default adapter;
