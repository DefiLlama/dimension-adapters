import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const WHLP = {
  shareToken: "0x1359b05241cA5076c9F59605214f4F84114c0dE8",
  accountant: "0x470bd109A24f608590d85fc1f5a4B6e625E8bDfF",
  accountantAbi: "function getRate() view returns (uint256)",
  erDecimals: 1e6,
  shareDecimals: 1e6,
  performanceFeeRate: 0.10,
};

const BASE_COINGECKO_ID = "usdt0";

async function erBeforeAfter(options: FetchOptions, target: string, abi: string): Promise<[number, number]> {
  const [before, after] = await Promise.all([
    options.fromApi.call({ target, abi, params: [] }),
    options.toApi.call({ target, abi, params: [] }),
  ]);
  return [Number(before), Number(after)];
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const totalSharesRaw = await options.api.call({
    target: WHLP.shareToken,
    abi: "function totalSupply() view returns (uint256)",
  });

  const [erBefore, erAfter] = await erBeforeAfter(options, WHLP.accountant, WHLP.accountantAbi);

  const shares = Number(totalSharesRaw) / WHLP.shareDecimals;
  const growthPerShare = (erAfter - erBefore) / WHLP.erDecimals;
  
  if (growthPerShare > 0) {
    const grossRewards = shares * growthPerShare;
    const protocolRevenue = grossRewards * WHLP.performanceFeeRate;
    const supplySideRevenue = grossRewards - protocolRevenue;
  
    dailyFees.addCGToken(BASE_COINGECKO_ID, grossRewards);
    dailySupplySideRevenue.addCGToken(BASE_COINGECKO_ID, supplySideRevenue);
    dailyRevenue.addCGToken(BASE_COINGECKO_ID, protocolRevenue);
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
    Fees: "Total fees generated from HLP by the WHLP vault and its deployed strategies.",
    Revenue: "The share of fees for Looping Collective.",
    ProtocolRevenue: "The share of fees for Looping Collective.",
    SupplySideRevenue: "Yield distributed to WHLP holders.",
  },
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-06-18",
};

export default adapter;
