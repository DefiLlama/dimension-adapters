import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { BOROS_ABIS, BOROS_FACTORY, BOROS_FACTORY_CREATION_BLOCK, getCgId } from "../dexs/boros";

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();

  const marketLogs = await options.getLogs({
    target: BOROS_FACTORY,
    eventAbi: BOROS_ABIS.MARKET_CREATION_EVENT,
    fromBlock: BOROS_FACTORY_CREATION_BLOCK,
    cacheInCloud: true,
  });

  const markets = marketLogs.filter((log: any) => Number(log.immData.k_maturity) > options.endTimestamp);
  const ois = await options.toApi.multiCall({ abi: 'uint256:getOI', calls: markets.map((log: any) => log.market) });

  markets.forEach((log: any, i: number) => {
    openInterestAtEnd.addCGToken(getCgId(Number(log.immData.k_tokenId)), Number(ois[i]) / 2 / 1e18);
  });

  return { openInterestAtEnd };
}

const methodology = {
  OpenInterest: "Notional size of open positions in all unmatured Boros markets at the end of the period, read from each market contract and priced in the market's collateral token. Each contract is counted once.",
};

const adapter: SimpleAdapter = {
  version: 2,
  // OI is a snapshot read at the window end; hourly records would be summed into the daily value
  pullHourly: false,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2025-07-28",
  methodology,
};

export default adapter;
