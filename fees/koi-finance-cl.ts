import adapter from '../dexs/koi-finance-cl';

export default adapter;

// import request, { gql } from "graphql-request";
// import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
// import { CHAIN } from "../helpers/chains";
// import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphFees";
// import BigNumber from "bignumber.js";

// const endpoints: any = {
//   [CHAIN.ERA]: "https://api.studio.thegraph.com/query/12332/koi-finance-v3/version/latest",
// }

// interface IData {
//   feesUSD: string
// }
// interface IPoolDay {
//   poolDayDatas: IData[]
// }

// const fetchFees = async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResultFees> => {
//   const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.startOfDay * 1000));
//   const graphQuery = gql`{
//     poolDayDatas(frist: 1000, where:{date:${todayTimestamp},tvlUSD_gt: 1000},orderBy:feesUSD, orderDirection: desc) {
//       feesUSD
//     }
//   }`;

//   try {
//     const graphRes: IPoolDay = await request(endpoints[options.chain], graphQuery);
//     const dailyFee = new BigNumber(graphRes.poolDayDatas.reduce((a: number, b: IData) => a + Number(b.feesUSD), 0))
//     return {
//       timestamp,
//       dailyFees: dailyFee.toString(),
//       dailyRevenue: dailyFee.times(0.2).toString(),
//     };
//   } catch (e) {
//     return { timestamp };
//   }
// };

// const adapter: SimpleAdapter = {
//   adapter: {
//     [CHAIN.ERA]: {
//       fetch: fetchFees,
//     },
//   },
// };

// export default adapter;
