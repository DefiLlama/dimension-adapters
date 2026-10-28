import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const EVENT_SWAP_EXECUTED =
  "event SwapExecuted(address indexed sender, address indexed srcToken, address indexed dstToken, uint256 spentAmount, uint256 returnAmount)";

const CONTRACTS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    "0x94693ede77177384db9B84aeD7d7f73D08A4cd40", // 0% commission
    "0xA6fbcf9296BD33BdEBee5ed729896CeDf2df05f0", // 0.01% commission
    "0xa9F07250ED38269865371D6C0Bf83d4aee1609D0", // 0.05% commission
    "0x8448b5f86D25E87da15195EC22e04c18B280B968", // 0.10% commission
    "0xEEe3fdCc5b9D7821570294b26070B2f45cFd8aEc", // 0.15% commission
  ],
};

const START_DATE: Record<string, string> = {
  [CHAIN.ETHEREUM]: "2025-09-21",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const targets = CONTRACTS[options.chain];
  if (!targets) return { dailyVolume };

  const logs = await options.getLogs({ targets, eventAbi: EVENT_SWAP_EXECUTED });
  logs.forEach((log) => {
    addOneToken({
      balances: dailyVolume,
      chain: options.chain,
      token0: log.srcToken,
      amount0: log.spentAmount,
      token1: log.dstToken,
      amount1: log.returnAmount,
    });
  });

  return { dailyVolume };
};

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
      "Volume is calculated by tracking SwapExecuted events across all commission tier contracts and summing spentAmount for each input token.",
  },
};

export default adapter;

