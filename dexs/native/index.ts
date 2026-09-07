import type { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainConfig: Record<string, { start: number }> = {
  [CHAIN.BSC]: { start: 46101475 },
  [CHAIN.ETHEREUM]: { start: 21627898 },
  [CHAIN.ARBITRUM]: { start: 297460493 },
  [CHAIN.BASE]: { start: 25970577 },
  [CHAIN.XLAYER]: { start: 61994385 },
  [CHAIN.ROBINHOOD]: { start: 60423 },
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
  fetch,
  methodology,
  adapter: chainConfig as any,
};

export default adapter;
