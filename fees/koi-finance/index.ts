// import { Adapter, FetchOptions, FetchResultFees } from '../../adapters/types';
// import { ZKSYNC } from '../../helpers/chains';
// import { fetchV1 } from './koi-finance';


// const getFees = async (options: FetchOptions) => {
//   const  [feeV1] = await Promise.all([fetchV1()(options)]);
//   const dailyFees = Number(feeV1.dailyFees);
//   const dailyRevenue = Number(feeV1.dailyRevenue);

//   return {
//     dailyFees,
//     dailyRevenue,
//   }
// }

// const adapter: Adapter = {
//   version: 2,
//   adapter: {
//     [ZKSYNC]: {
//       fetch: getFees,
//       start: '2023-02-23', // TODO: Add accurate timestamp
//     },
//   },
// };

// export default adapter;

import adater from "../../dexs/mute.io";

export default adater;
