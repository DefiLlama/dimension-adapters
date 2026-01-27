// import { CHAIN } from '../../helpers/chains';
// import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume';
// import { httpGet } from '../../utils/fetchURL';


// const cropperEndpoint = "https://flow.cropper.finance/stats24.json";

// interface Stats24H {
//   dailyVolume: number
//   dailyFees: number
//   details: number
//   timestamp: number
// };

// async function fetch() {
//   const timestamp = getUniqStartOfTodayTimestamp()
//   let response: Stats24H = await httpGet(cropperEndpoint);
//   return {
//     dailyVolume: response.dailyVolume,
//     timestamp,
//   };
// }

// export default {
//     version: 1,
//     adapter: {
//         [CHAIN.SOLANA]: {
//             fetch: fetch,
//             runAtCurrTime: true,
//             start: '2024-04-24',
//         }
//     }
// }

import { alliumSolanaDexExport } from "../../helpers/alliumDex";
export default alliumSolanaDexExport('cropper', 'cropper-whirlpool', '2024-04-24')
