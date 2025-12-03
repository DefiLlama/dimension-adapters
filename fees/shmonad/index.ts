import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SHMONAD_CONTRACT = "0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c";

const ABIS = {
  totalAssets: "uint256:totalAssets",
  totalSupply: "uint256:totalSupply",
};

const PROTOCOL_FEE = 0.05; // 5% protocol revenue

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [assetsBefore, supplyBefore] = await Promise.all([
    options.fromApi.call({ target: SHMONAD_CONTRACT, abi: ABIS.totalAssets }),
    options.fromApi.call({ target: SHMONAD_CONTRACT, abi: ABIS.totalSupply }),
  ]);

  const [assetsAfter, supplyAfter] = await Promise.all([
    options.toApi.call({ target: SHMONAD_CONTRACT, abi: ABIS.totalAssets }),
    options.toApi.call({ target: SHMONAD_CONTRACT, abi: ABIS.totalSupply }),
  ]);

  // Compute exchange rate
  const rateBefore = (assetsBefore * 1e18) / supplyBefore;
  const rateAfter = (assetsAfter * 1e18) / supplyAfter;
  const netRewards = ((rateAfter - rateBefore) * supplyBefore) / 1e18; 

  const grossRewards = netRewards / (1 - PROTOCOL_FEE); 
  
  dailyFees.addGasToken(grossRewards);            
  dailyProtocolRevenue.addGasToken(grossRewards * PROTOCOL_FEE); 
  dailySupplySideRevenue.addGasToken(grossRewards * (1 - PROTOCOL_FEE)); 

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2024-11-01",
    },
  },
  methodology: {
    Fees: "Fees calculated from exchange rate appreciation (totalAssets / totalSupply), following ERC-4626 standard.",
    Revenue: "5% of yield goes to protocol, deducted before distributing to shMON holders.",
    ProtocolRevenue: "5% performance fee collected by the protocol.",
    SupplySideRevenue: "95% of yield increases shMON value for holders.",
  },
};

export default adapter;
