import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const FACTORY = "0xFf8578C2949148A6F19b7958aE86CAAb2779CDDD";

const uniV3Fetch = getUniV3LogAdapter({ factory: FACTORY });

async function fetch(options: FetchOptions) {
  const results = await uniV3Fetch(options);
  return { dailyVolume: results.dailyVolume };
}

export default {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MORPH],
  start: '2024-10-19',
  methodology: {
    Volume: "Sum of the value of all token swaps across BulbaSwap V3 pools.",
  },
};
