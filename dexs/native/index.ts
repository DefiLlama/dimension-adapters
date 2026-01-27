import type { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const routers = {
  [CHAIN.BSC]: {
    address: "0xC6a5cD6C5f56D8BaAa58be5c516Bb889059651a3",
    startBlock: 46101475
  },
  [CHAIN.ETHEREUM]: {
    address: "0x5c0abf0f651613696a5c57efafc6ab59a460b32d",
    startBlock: 21627898
  },
  [CHAIN.ARBITRUM]: {
    address: "0x5C0aBf0F651613696A5c57efafC6ab59A460B32d",
    startBlock: 297460493
  },
  [CHAIN.BASE]: {
    address: "0x5C0aBf0F651613696A5c57efafC6ab59A460B32d",
    startBlock: 25970577
  }
};

const RFQ_TRADE_EVENT = 'event RFQTrade(address recipient, address sellerToken, address buyerToken, uint256 sellerTokenAmount, uint256 buyerTokenAmount, bytes16 quoteId, address signer)';

const fetch: FetchV2 = async (options: FetchOptions) => {
  const address = routers[options.chain].address;
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

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(routers).reduce((acc, chain) => {
    const { startBlock } = routers[chain];

    return {
      ...acc,
      [chain]: {
        fetch,
        start: startBlock,
      },
    };
  }, {}),
};

export default adapter;
