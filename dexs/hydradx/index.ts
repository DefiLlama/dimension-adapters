import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getHydrationBlock } from "../../helpers/getBlock";
import { request } from "graphql-request";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  function toDateQuery(timestmap: number): string {
    return new Date(timestmap * 1000).toISOString();
  }
  
  // Fetch fees data from GraphQL endpoint
  const query = `
    query MyQuery {
      platformTotalVolumesByPeriod(filter: {startIsoString: "${toDateQuery(options.fromTimestamp)}", endIsoString: "${toDateQuery(options.toTimestamp)}"}) {
        nodes {
          totalVolNorm
          xykpoolFeeVolNorm
          stableswapFeeVolNorm
          omnipoolFeeVolNorm
        }
      }
    }
  `;

  const queryResult = await request("https://orca-main-aggr-indx.indexer.hydration.cloud/graphql", query);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  for (const node of queryResult.platformTotalVolumesByPeriod.nodes) {
    dailyVolume.addUSDValue(Number(node.totalVolNorm));
    dailyFees.addUSDValue(Number(node.xykpoolFeeVolNorm), 'XYK Pools Fees');
    dailyFees.addUSDValue(Number(node.stableswapFeeVolNorm), 'StableSwap Fees');
    dailyFees.addUSDValue(Number(node.omnipoolFeeVolNorm), 'Omni Pool Fees');
    
    dailySupplySideRevenue.addUSDValue(Number(node.xykpoolFeeVolNorm), 'XYK Pools Fees To LPs');
    dailySupplySideRevenue.addUSDValue(Number(node.stableswapFeeVolNorm), 'StableSwap Fees To LPs');
    dailySupplySideRevenue.addUSDValue(Number(node.omnipoolFeeVolNorm) * 0.8, 'Omni Pool Fees To LPs');
    
    const revenue = Number(node.omnipoolFeeVolNorm) * 0.2;
    const amountH2OBurn = Number(node.omnipoolFeeVolNorm) * 0.2 * 0.5;
    const revenueProtocol = revenue - amountH2OBurn;
    
    // H2O is not DEX gov token, count it as supply-side
    dailySupplySideRevenue.addUSDValue(amountH2OBurn, 'H2O Token Burnt');

    dailyRevenue.addUSDValue(revenueProtocol, 'Omni Pool Fees To Hydration DEX');

    dailyProtocolRevenue.addUSDValue(revenueProtocol, 'Omni Pool Fees To Hydration DEX');
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
    dailyProtocolRevenue,
  };
};


const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.HYDRADX]: {
      fetch,
      start: '2024-04-28',
    },
  },
  
  // https://docs.hydration.net/products/trading/fees#protocol-fee
  methodology: {
    Fees: 'All fees paid by users for swaps on Hydration.',
    Revenue: 'Approx 1/5th of fees is distributed to the protocol',
    SupplySideRevenue: 'All fees paid to liquidity providers for stableswap and xykpool. For omnipool, approx 80%. of the fees',
    ProtocolRevenue: 'Approx 1/10th of fees is distributed to the protocol treasury',
    HoldersRevenue: 'Paid in H2O tokens, are burnt',
  },
  breakdownMethodology: {
    Fees: {
      'XYK Pools Fees': 'All fees collected from XYK pools.',
      'StableSwap Fees': 'All fees collected from stable swap pools.',
      'Omni Pool Fees': 'All fees collected from omni pool.',
    },
    Revenue: {
      'Omni Pool Fees To Hydration DEX': 'Share of 50% from 20% all Omni Pool Fees.',
    },
    ProtocolRevenue: {
      'Omni Pool Fees To Hydration DEX': 'Share of 50% from 20% all Omni Pool Fees.',
    },
    SupplySideRevenue: {
      'XYK Pools Fees To LPs': 'All fees collected from XYK pools to LPs.',
      'StableSwap Fees To LPs': 'All fees collected from stable swap pools to LPs.',
      'Omni Pool Fees To LPs': '80% of Omni pool fees share to LPs',
      'H2O Token Burnt': 'All fees were paid in H2O were burnt.',
    },
  }
};

export default adapter;
