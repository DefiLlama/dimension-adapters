import type { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const startBlocks: Record<string, number> = {
  [CHAIN.BSC]: 46101475,
  [CHAIN.ETHEREUM]: 21627898,
  [CHAIN.ARBITRUM]: 297460493,
  [CHAIN.BASE]: 25970577,
  [CHAIN.XLAYER]: 59885326,
  [CHAIN.ROBINHOOD]: 60423,
};

const RFQ_TRADE_EVENT = 'event RFQTrade(address recipient, address sellerToken, address buyerToken, uint256 sellerTokenAmount, uint256 buyerTokenAmount, bytes16 quoteId, address signer)';

const fetch: FetchV2 = async (options: FetchOptions) => {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();

  const logs = await getLogs({
    noTarget: true,
    eventAbi: RFQ_TRADE_EVENT,
    skipIndexer: true
  });

  logs.forEach((log: any) => {
    dailyVolume.add(log.buyerToken, log.buyerTokenAmount);
  });

  return {
    dailyVolume,
  };
}

const methodology = {
  Volume: 'Value of the tokens traders receive from each swap quoted by a Native market maker.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: Object.keys(startBlocks).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: startBlocks[chain],
      },
    };
  }, {}),
};

export default adapter;
