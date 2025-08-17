import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

// const endpoint =
//   "https://api.goldsky.com/api/public/project_cmb20ryy424yb01wy7zwd7xd1/subgraphs/analytics/1.2.3/gn";

// // GraphQL query to fetch total volume
// const totalVolumeQuery = gql`
//   query {
//     factories(first: 1) {
//       totalVolumeUSD
//     }
//   }
// `;

// // GraphQL query to fetch daily volume, total fees, and per-pool fees/community fees
// const dailyVolumeFeesQuery = gql`
//   query ($date: Int!) {
//     algebraDayDatas(where: { date: $date }) {
//       volumeUSD
//       feesUSD
//     }
//     pools {
//       feesUSD
//       communityFee
//     }
//   }
// `;

// // Function to fetch total volume
// const fetchTotalVolume = async () => {
//   const response = await request(endpoint, totalVolumeQuery);
//   return response.factories[0]?.totalVolumeUSD || "0";
// };

// // Function to fetch daily volume, fees, and correctly calculated revenue
// const fetchDailyData = async (date: number) => {
//   const response = await request(endpoint, dailyVolumeFeesQuery, { date });
//   const data = response.algebraDayDatas[0] || {};
//   const pools = response.pools || [];

//   const totalFeesUSD = parseFloat(data.feesUSD) || 0;

//   if (totalFeesUSD === 0) {
//     return { volumeUSD: data.volumeUSD || "0", feesUSD: "0", revenueUSD: "0" };
//   }

//   let totalRevenue = 0;

//   pools.forEach((pool) => {
//     const poolFees = parseFloat(pool.feesUSD) || 0;
//     const communityFee = pool.communityFee
//       ? parseFloat(pool.communityFee) / 10000
//       : 0;

//     const poolRevenue = poolFees * communityFee;

//     totalRevenue += poolRevenue;
//   });

//   return {
//     volumeUSD: data.volumeUSD || "0",
//     feesUSD: data.feesUSD || "0",
//     revenueUSD: totalRevenue.toFixed(2),
//   };
// };

// https://gliquids-organization.gitbook.io/gliquid/about-us/fee-structure
const factoryConfig = {
  isAlgebraV3: true,
  poolCreatedEvent: 'event Pool (address indexed token0, address indexed token1, address pool)',
  swapEvent: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)',
  userFeesRatio: 1,
  revenueRatio: 0.13,
  protocolRevenue: 0.1,
  holdersRevenueRatio: 0,
}

const adapter: SimpleAdapter = {
  // adapter: {
  //   [CHAIN.HYPERLIQUID]: {
  //     fetch: async (timestamp: number) => {
  //       const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
  //       const totalVolume = await fetchTotalVolume();
  //       const { volumeUSD, feesUSD, revenueUSD } = await fetchDailyData(
  //         dayTimestamp
  //       );

  //       return {
  //         totalVolume: parseFloat(totalVolume),
  //         dailyVolume: parseFloat(volumeUSD),
  //         dailyFees: parseFloat(feesUSD),
  //         dailyRevenue: parseFloat(revenueUSD),
  //         dailySupplySideRevenue: parseFloat(feesUSD) - parseFloat(revenueUSD),
  //         timestamp: dayTimestamp,
  //       };
  //     },
  //     start: "2025-02-06",
  //   },
  // },
  version: 2,
  methodology: {
    Volume: "Total users swap volume.",
    Fees: "Swap fees paid by users.",
    UserFees: "Swap fees paid by users.",
    Revenue: "13% swap fees distributed to Gliquid and Algebra team.",
    ProtocolRevenue: "Gliquid team collects 10% swap fees.",
    SupplySideRevenue: "87% swap fees distributed to LPs",
    HoldersRevenue: "No revenue for token holders.",
  },
  fetch: getUniV3LogAdapter({ factory: '0x10253594A832f967994b44f33411940533302ACb', ...factoryConfig }),
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-06',
};

export default adapter;
