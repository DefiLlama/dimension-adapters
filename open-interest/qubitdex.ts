import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { SimpleAdapter, FetchOptions } from "../adapters/types";

const fetch = async (_a: FetchOptions) => {
  const { data } = await fetchURL('https://api.internal.qubit.trade/v1/contract/openInterest')

  const openInterestAtEnd = data.reduce((a: number, b: { open_interest: string }) => a + (Number(b.open_interest)), 0)

  return { openInterestAtEnd };
}

const methodology = {
  OpenInterest: 'Open Interest is the sum of long and short open interest of all perpetual contract pairs on QuBitDEX.'
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2025-09-10",
  methodology: methodology,
  runAtCurrTime: true,
};

export default adapter; 