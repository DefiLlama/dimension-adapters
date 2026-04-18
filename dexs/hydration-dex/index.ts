import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  for (const node of queryResult.platformTotalVolumesByPeriod.nodes) {
    dailyVolume.addUSDValue(Number(node.totalVolNorm));
    dailyFees.addUSDValue(Number(node.xykpoolFeeVolNorm), 'XYK Pools Fees');
    dailyFees.addUSDValue(Number(node.stableswapFeeVolNorm), 'StableSwap Fees');
    dailyFees.addUSDValue(Number(node.omnipoolFeeVolNorm), 'Omnipool Fees');

    // XYK and Stableswap fees go 100% to LPs
    dailySupplySideRevenue.addUSDValue(Number(node.xykpoolFeeVolNorm), 'XYK Pools Fees To LPs');
    dailySupplySideRevenue.addUSDValue(Number(node.stableswapFeeVolNorm), 'StableSwap Fees To LPs');

    // Omnipool has two independent fee types combined in omnipoolFeeVolNorm:
    //   Asset fee  (≈80% of total): 50% stays in pool → LPs, 50% → Referral pallet (stakers/referrers/traders)
    //   Protocol fee (≈20% of total): 100% → Treasury (BurnProtocolFee = 0% in runtime)
    // Ratio approximated from fee ranges: asset 0.15-5%, protocol 0.05-0.25%
    const omnipoolFee = Number(node.omnipoolFeeVolNorm);
    const assetFee    = omnipoolFee * 0.8;
    const protocolFee = omnipoolFee * 0.2;

    dailySupplySideRevenue.addUSDValue(assetFee * 0.5, 'Omnipool Asset Fees To LPs');
    dailyHoldersRevenue.addUSDValue(assetFee * 0.5, 'Omnipool Asset Fees To Stakers & Referrals');

    // BurnProtocolFee = 0% in runtime (hydration-node/runtime/hydradx/src/assets.rs)
    // 100% of protocol fee goes to Treasury; nothing is burned currently
    dailyProtocolRevenue.addUSDValue(protocolFee, 'Omnipool Protocol Fees To Treasury');

    dailyRevenue.addUSDValue(assetFee * 0.5, 'Omnipool Asset Fees To Stakers & Referrals');
    dailyRevenue.addUSDValue(protocolFee, 'Omnipool Protocol Fees To Treasury');
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
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
    Fees: 'All fees paid by users for swaps on Hydration (asset fees + protocol fees across all pool types).',
    Revenue: '50% of Omnipool asset fees distributed to HDX stakers & referrals, plus 50% of Omnipool protocol fees sent to Treasury.',
    SupplySideRevenue: '100% of XYK and Stableswap fees go to LPs. For Omnipool, 50% of the asset fee (≈40% of total Omnipool fees) stays in the pool for LPs.',
    ProtocolRevenue: '100% of Omnipool protocol fees (≈20% of total Omnipool fees) sent to Treasury. BurnProtocolFee is set to 0% in the runtime (no H2O burn currently active).',
    HoldersRevenue: '50% of Omnipool asset fees (≈40% of total Omnipool fees) distributed via the Referral pallet to HDX stakers, referrers, and traders.',
  },
  breakdownMethodology: {
    Fees: {
      'XYK Pools Fees': 'All fees collected from XYK pools.',
      'StableSwap Fees': 'All fees collected from stable swap pools.',
      'Omnipool Fees': 'All fees collected from Omnipool (asset fee + protocol fee combined).',
    },
    Revenue: {
      'Omnipool Asset Fees To Stakers & Referrals': '50% of Omnipool asset fees distributed via the Referral pallet.',
      'Omnipool Protocol Fees To Treasury': '100% of Omnipool protocol fees sent to Treasury (BurnProtocolFee = 0% in runtime).',
    },
    ProtocolRevenue: {
      'Omnipool Protocol Fees To Treasury': '100% of Omnipool protocol fees sent to Treasury (BurnProtocolFee = 0% in runtime).',
    },
    SupplySideRevenue: {
      'XYK Pools Fees To LPs': 'All fees collected from XYK pools go to LPs.',
      'StableSwap Fees To LPs': 'All fees collected from Stableswap pools go to LPs.',
      'Omnipool Asset Fees To LPs': '50% of Omnipool asset fees stay in the pool for LPs.',
    },
    HoldersRevenue: {
      'Omnipool Asset Fees To Stakers & Referrals': '50% of Omnipool asset fees distributed via the Referral pallet to HDX stakers, referrers, and traders.',
    },
  }
};

export default adapter;
