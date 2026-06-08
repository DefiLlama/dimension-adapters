import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { formatAddress } from "../utils/utils";

const CCA_FACTORY_V1 = "0x0000ccaDF55C911a2FbC0BB9d2942Aa77c6FAa1D";
const CCA_FACTORY_V1_1 = "0xCCccCcCAE7503Cac057829BF2811De42E16e0bD5";

const AUCTION_CREATED = "event AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData)";
const BID_SUBMITTED_V1 = "event BidSubmitted(uint256 indexed id, address indexed owner, uint256 price, uint128 amount)";
const BID_SUBMITTED_V1_1 = "event BidSubmitted(uint256 indexed id, address indexed owner, uint256 price, uint256 amount)";
const CURRENCY_SWEPT = "event CurrencySwept(address indexed fundsRecipient, uint256 currencyAmount)";
const CURRENCY = "function currency() view returns (address)";

type ChainConfig = {
  start: string;
  factories: {
    address: string;
    fromBlock: number;
  }[];
};

const CONFIGS: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    start: "2025-11-12",
    factories: [
      { address: CCA_FACTORY_V1, fromBlock: 23780787 },
      { address: CCA_FACTORY_V1_1, fromBlock: 24321671 },
    ],
  },
  [CHAIN.UNICHAIN]: {
    start: "2025-11-13",
    factories: [
      { address: CCA_FACTORY_V1, fromBlock: 32316559 },
      { address: CCA_FACTORY_V1_1, fromBlock: 38733234 },
    ],
  },
  [CHAIN.BASE]: {
    start: "2025-11-20",
    factories: [
      { address: CCA_FACTORY_V1, fromBlock: 38441212 },
      { address: CCA_FACTORY_V1_1, fromBlock: 41336767 },
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: "2025-12-18",
    factories: [
      { address: CCA_FACTORY_V1, fromBlock: 411868855 },
      { address: CCA_FACTORY_V1_1, fromBlock: 425561184 },
    ],
  },
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();
  const config = CONFIGS[options.chain];

  const createdLogsByFactory = await Promise.all(
    config.factories.map((factory) =>
      options.getLogs({
        target: factory.address,
        eventAbi: AUCTION_CREATED,
        fromBlock: factory.fromBlock,
        cacheInCloud: true,
      })
    )
  );

  const auctionAddresses = Array.from(
    new Set(createdLogsByFactory.flat().map((log: any) => formatAddress(log.auction)))
  );

  if (!auctionAddresses.length) return { dailyVolume, dailyNotionalVolume };

  const currencies = await options.api.multiCall({
    abi: CURRENCY,
    calls: auctionAddresses,
  });

  const auctionCurrencyByAddress: Record<string, string> = {};
  for (let i = 0; i < auctionAddresses.length; i++) {
    auctionCurrencyByAddress[auctionAddresses[i]] = formatAddress(currencies[i]);
  }

  const [bidLogsV1, bidLogsV1_1, sweepLogs] = await Promise.all([
    options.getLogs({
      targets: auctionAddresses,
      eventAbi: BID_SUBMITTED_V1,
      flatten: false,
    }),
    options.getLogs({
      targets: auctionAddresses,
      eventAbi: BID_SUBMITTED_V1_1,
      flatten: false,
    }),
    options.getLogs({
      targets: auctionAddresses,
      eventAbi: CURRENCY_SWEPT,
      flatten: false,
    }),
  ]);

  for (let i = 0; i < auctionAddresses.length; i++) {
    const currency = auctionCurrencyByAddress[auctionAddresses[i]];
    for (const log of bidLogsV1[i].concat(bidLogsV1_1[i])) {
      dailyNotionalVolume.add(currency, log.amount);
    }
    for (const log of sweepLogs[i]) {
      dailyVolume.add(currency, log.currencyAmount);
    }
  }

  return { dailyVolume, dailyNotionalVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: "Realized Uniswap Launchpad auction proceeds only if the auction graduated. It means we count finalized, withdrawable auction proceeds, not bid budgets.",
    NotionalVolume: "Submitted CCA bid budgets in the auction currency, counted when bids are committed.",
  },
  adapter: CONFIGS,
  fetch,
};

export default adapter;
