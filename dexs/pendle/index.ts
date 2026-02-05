import {
  FetchGetLogsOptions,
  FetchOptions,
  FetchResultV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { Balances } from "@defillama/sdk";

type MarketData = {
  address: string;
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

const chains: { [chain: string]: { id: number; start: string } } = {
  [CHAIN.ETHEREUM]: { id: 1, start: '2023-06-09' },
  [CHAIN.ARBITRUM]: { id: 42161, start: '2023-06-09' },
  [CHAIN.MANTLE]: { id: 5000, start: '2024-03-27' },
  [CHAIN.BSC]: { id: 56, start: '2023-06-09' },
  [CHAIN.OPTIMISM]: { id: 10, start: '2023-08-11' },
};

async function amm(
  apiData: MarketData[],
  getLogs: (params: FetchGetLogsOptions) => Promise<any[]>,
  balances: Balances,
): Promise<void> {
  const assets: { [address: string]: string } = {};
  apiData.map((market: MarketData) => {
    assets[market.address] = market.sy.address;
  });

  const swapEvents: { [address: string]: any[] } = {};
  await Promise.all(
    Object.keys(assets).map(
      async (target: string) =>
        await getLogs({
          eventAbi: abi.marketSwapEvent,
          target,
        }).then((e) => {
          swapEvents[target] = e;
        }),
    ),
  );

  Object.keys(swapEvents).map((market) => {
    swapEvents[market].map((swap) => {
      balances.add(assets[market], Math.abs(Number(swap.netSyOut)));
    });
  });
}

async function limitOrder(
  apiData: MarketData[],
  getLogs: (params: FetchGetLogsOptions) => Promise<any[]>,
  balances: Balances,
): Promise<void> {
  const fills = await getLogs({
    target: "0x000000000000c9b3e2c3ec88b1b4c0cd853f4321",
    eventAbi: abi.orderFilledV2,
  });

  const ytToSy: { [yt: string]: string } = {};
  apiData.map((market: MarketData) => {
    ytToSy[market.yt.address.toLowerCase()] = market.sy.address;
  });

  fills.map((fill) => {
    if (ytToSy[fill.YT.toLowerCase()]) {
      balances.add(ytToSy[fill.YT.toLowerCase()], fill.notionalVolume);
    } else {
      // console.log(fill.YT, ytToSy[fill.YT.toLowerCase()]);
    }
  });
}

const fetch = (chain: Chain) => {
  return async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyVolume: Balances = options.createBalances();
    const res = await fetchURL(
      `https://api-v2.pendle.finance/core/v1/${chains[chain].id}/markets?limit=100&select=pro&is_active=true`,
    );

    await Promise.all([
      await amm(res.results, options.getLogs, dailyVolume),
      await limitOrder(res.results, options.getLogs, dailyVolume),
    ]);

    return {
      dailyVolume,
    };
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {},
};

Object.keys(chains).map((chain) => {
  adapter.adapter![chain] = {
    fetch: fetch(chain),
    start: chains[chain].start,
  };
});

export default adapter;
