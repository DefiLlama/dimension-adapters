import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const config = {
    [CHAIN.UNICHAIN]: {
      uniderpHook: "0xb4960cd4f9147f9e37a7aa9005df7156f61e4444", start: "2025-05-01",
    },
}


const eventAbi = "event FeeTaken(uint8 indexed feeType, address indexed token, address indexed receiver, uint256 amount)"

const fetchFees = async (uniderpHook:string, options: FetchOptions): Promise<FetchResultV2> => {
  const {getLogs, createBalances} = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const logs = await getLogs({
    target: uniderpHook,
    eventAbi,
  });
  for (const log of logs) {
    dailyFees.addToken(log.token, log.amount);
    if (log.feeType === 0n) {
      dailyRevenue.addToken(log.token, log.amount);
    }
  }
  return { dailyFees, dailyRevenue };
}



const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(config).reduce((acc, chain) => {
    const { uniderpHook, start } = config[chain];
    acc[chain] = {
      fetch: (options: FetchOptions) => fetchFees(uniderpHook, options),
      start: start,
    };
    return acc;
  }, {}),
};

export default adapter;