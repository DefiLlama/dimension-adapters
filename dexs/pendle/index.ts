import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";
import { getConfig } from "../../helpers/cache";

type MarketData = {
  address: string;
  timestamp: string;
  expiry: string;
  sy: {
    address: string;
  };
  yt: {
    address: string;
  };
};

const abi: { [event: string]: string } = {
  orderFilledV2:
    "event OrderFilledV2(bytes32 indexed orderHash, uint8 indexed orderType, address indexed YT, address token, uint256 netInputFromMaker, uint256 netOutputToMaker, uint256 feeAmount, uint256 notionalVolume, address maker, address taker)",
  marketSwapEvent:
    "event Swap(address indexed caller, address indexed receiver, int256 netPtOut, int256 netSyOut, uint256 netSyFee, uint256 netSyToReserve)",
};

const LIMIT_ROUTER = "0x000000000000c9b3e2c3ec88b1b4c0cd853f4321";

const chains: { [chain: string]: { id: number; start: string } } = {
  [CHAIN.ETHEREUM]: { id: 1, start: '2023-06-09' },
  [CHAIN.ARBITRUM]: { id: 42161, start: '2023-06-09' },
  [CHAIN.MANTLE]: { id: 5000, start: '2024-03-27' },
  [CHAIN.BSC]: { id: 56, start: '2023-06-09' },
  [CHAIN.OPTIMISM]: { id: 10, start: '2023-08-11' },
  [CHAIN.BASE]: { id: 8453, start: '2024-11-27' },
  [CHAIN.SONIC]: { id: 146, start: "2025-02-25" },
  [CHAIN.BERACHAIN]: { id: 80094, start: "2025-03-24" },
  [CHAIN.PLASMA]: { id: 9745, start: "2025-09-30" },
  [CHAIN.HYPERLIQUID]: { id: 999, start: "2025-07-29" },
  [CHAIN.MONAD]: { id: 143, start: "2026-06-18" },
  [CHAIN.XLAYER]: { id: 196, start: "2026-08-02" },
  [CHAIN.ROBINHOOD]: { id: 4663, start: "2026-09-02" },
};

// every market ever deployed, so that backfills see the markets that were live on that day
async function getAllMarkets(chainId: number): Promise<MarketData[]> {
  const weekId = Math.floor(Date.now() / 1000 / 60 / 60 / 24 / 7);
  let markets: MarketData[] = [];
  let skip = 0;

  while (true) {
    const { results } = await getConfig(
      `pendle-markets/${chainId}-${skip}-${weekId}`,
      `https://api-v2.pendle.finance/core/v1/${chainId}/markets?limit=100&skip=${skip}&select=all`
    );
    markets = markets.concat(results);
    if (results.length < 100) return markets;
    skip += 100;
  }
}

async function amm(
  markets: MarketData[],
  options: FetchOptions,
  balances: Balances,
): Promise<void> {
  const logs = await options.getLogs({
    targets: markets.map((market) => market.address),
    eventAbi: abi.marketSwapEvent,
    flatten: false,
  });

  markets.forEach((market, i) => {
    logs[i].forEach((swap: any) => {
      balances.add(market.sy.address, Math.abs(Number(swap.netSyOut)));
    });
  });
}

async function limitOrder(
  markets: MarketData[],
  options: FetchOptions,
  balances: Balances,
): Promise<void> {
  const fills = await options.getLogs({
    target: LIMIT_ROUTER,
    eventAbi: abi.orderFilledV2,
  });

  const ytToSy: { [yt: string]: string } = {};
  markets.forEach((market) => {
    ytToSy[market.yt.address.toLowerCase()] = market.sy.address;
  });

  fills.forEach((fill: any) => {
    const sy = ytToSy[fill.YT.toLowerCase()];
    if (sy) balances.add(sy, fill.notionalVolume);
  });
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume: Balances = options.createBalances();

  // a market can only trade between its deployment and its expiry
  const markets = (await getAllMarkets(chains[options.chain].id)).filter(
    (market) =>
      new Date(market.timestamp).getTime() / 1000 < options.endTimestamp &&
      new Date(market.expiry).getTime() / 1000 > options.startTimestamp
  );
  if (!markets.length) return { dailyVolume };

  await Promise.all([
    amm(markets, options, dailyVolume),
    limitOrder(markets, options, dailyVolume),
  ]);

  return {
    dailyVolume,
  };
};

const methodology = {
  Volume: "Value traded in Pendle's pools plus limit orders filled on Pendle's order book, counted once per trade on the yield-bearing token side. A YT trade counts the size of the position it opens, not the smaller amount the trader pays for it. Minting and redeeming PT/YT is not a trade and is excluded.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {},
  fetch,
  methodology,
};

Object.keys(chains).map((chain) => {
  adapter.adapter![chain] = {
    start: chains[chain].start,
  };
});

export default adapter;
