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

// Unofficial adapter contracts that sat as RFQ recipient for the Jul-Aug 2026 BSC volume spike. Not Binance or Native. Same deployer rotated 0x309fcd -> 0x23e2b374.
const SKIP_RECIPIENTS = new Set([
  '0x309fcdd159c15e6305f1b02489a14e870e4df052',
  '0x23e2b37415ee3b9cfe1ae522e42e2b66fd2d9494',
]);

const fetch: FetchV2 = async (options: FetchOptions) => {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();

  const logs = await getLogs({
    noTarget: true,
    eventAbi: RFQ_TRADE_EVENT,
    skipIndexer: true
  });

  logs.forEach((log: any) => {
    if (SKIP_RECIPIENTS.has(String(log.recipient).toLowerCase())) return;
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
