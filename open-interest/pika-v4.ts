import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const oi = await options.api.call({  abi:'uint256:totalOpenInterest' , target:'0x8c9b6a4a4e61F4635E8e375E05ff98Db5516d25E' })

  return { openInterestAtEnd: Number(oi) / 10 ** 8 };
}

export default {
  start: '2024-01-27',
  chains: [CHAIN.OPTIMISM],
  fetch,
  version: 2,
}