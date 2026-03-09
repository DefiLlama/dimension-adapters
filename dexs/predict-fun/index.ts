import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPolymarketVolume } from "../../helpers/polymarket";

const EXCHANGE_CONTRACT_ADDRESSES = [
  '0x6bEb5a40C032AFc305961162d8204CDA16DECFa5', // CTFExchange - Yield Bearing
  '0x8A289d458f5a134bA40015085A8F50Ffb681B41d', // NegRiskCtfExchange - Yield Bearing
  '0x8BC070BEdAB741406F4B1Eb65A72bee27894B689', // CTFExchange - Non Yield
  '0x365fb81bd4A24D6303cd2F19c349dE6894D8d58A', // NegRiskCtfExchange - Non Yield
];

const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955"; 

const fetch = async (options: FetchOptions) => {
  const { dailyVolume } = await getPolymarketVolume({ options, exchanges: EXCHANGE_CONTRACT_ADDRESSES, currency: USDT_ADDRESS });

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-11-22",
    },
  },
};

export default adapter;