import { SimpleAdapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { evmReceivedGasAndTokens } from "../helpers/token";

const fetch = async (options: FetchOptions) => {
  return evmReceivedGasAndTokens('0xca90d843288e35beeadfce14e5f906e3f1afc7cb', [])(options)
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
}

export default adapter;
