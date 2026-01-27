import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

// export const LINKS: any = {
//   [CHAIN.BOTANIX]: "https://api.studio.thegraph.com/query/113221/analytics/v0.0.1",
// };

// export const fetch = async (_: any, _1: any, options: FetchOptions) => {
//   const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.startOfDay) / 86400);
//   const query = `{
//     algebraDayData(id: ${dateId}) { feesUSD volumeUSD }
//   }`;

//   const data: any = await request(LINKS[options.chain], query);

//   return {
//     dailyFees: data.algebraDayData?.feesUSD,
//     dailyUserFees: data.algebraDayData?.feesUSD,
//     dailyVolume: data.algebraDayData?.volumeUSD,
//   };
// };

const poolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)'

export default {
  version: 2,
  adapter: {
    [CHAIN.BOTANIX]: {
      fetch: getUniV3LogAdapter({ factory: '0x57Fd247Ce7922067710452923806F52F4b1c2D34', isAlgebraV3: true, userFeesRatio: 1, poolCreatedEvent, swapEvent }),
      start: "2025-06-29",
    },
  },
};
