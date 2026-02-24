import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const EVENT_SWAP_EXECUTED =
  "event SwapExecuted(address indexed sender, address indexed srcToken, address indexed dstToken, uint256 spentAmount, uint256 returnAmount)";

const CONTRACTS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xEEe3fdCc5b9D7821570294b26070B2f45cFd8aEc",
};

const START_DATE: Record<string, string> = {
  [CHAIN.ETHEREUM]: "2025-09-21",
};


const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const target = CONTRACTS[options.chain];
  if (!target) return { dailyVolume };
  const logs = await options.getLogs({ target, eventAbi: EVENT_SWAP_EXECUTED, });
  logs.forEach((log) => {
    addOneToken({ balances: dailyVolume, chain: options.chain, token0: log.srcToken, amount0: log.spentAmount, token1: log.dstToken, amount1: log.returnAmount })
  });

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  pullHourly: true,
  version: 2,
  adapter: Object.keys(CONTRACTS).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: { fetch, start: START_DATE[chain] },
    };
  }, {} as Record<string, any>),
  methodology: {
    Volume:
      "Volume is calculated by tracking SwapExecuted events and summing spentAmount for each input token.",
  },
};

export default adapter;


