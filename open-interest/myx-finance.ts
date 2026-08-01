import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const chainConfig = {
  [CHAIN.ARBITRUM]: { start: '2024-01-31', chainId: 42161},
  [CHAIN.LINEA]: { start: '2024-02-21', chainId: 59144},
  [CHAIN.BSC]: { start: '2025-03-16', chainId: 56},
  [CHAIN.OP_BNB]: { start: '2025-03-16', chainId: 204},
}

const fetch = async (options: FetchOptions) => {
  const url = `https://api.myx.finance/v2/scan/stat/dashboard?chainId=${chainConfig[options.chain].chainId}`
  const data = await fetchURL(url)
  const openInterestAtEnd = Number(data.data.positionAmount);
  return { openInterestAtEnd }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  runAtCurrTime: true,
  adapter: chainConfig
}

export default adapter;
