import { EventLog, getAddress, zeroPadValue } from "ethers";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ABIS = {
  Market: {
    config:
      "function config() external view returns (address treasurer, uint64 maturity, tuple(uint32,uint32,uint32,uint32,uint32,uint32) feeConfig)",
    tokens:
      "function tokens() external view returns (address fixedToken, address xToken, address gearingToken, address collateral, address debt)",
  },
};

const Events = {
  CreateMarket: {
    eventAbi:
      "event CreateMarket(address indexed market, address indexed collateral, address indexed debtToken)",
    topic: "0x3f53d2c2743b2b162c0aa5d678be4058d3ae2043700424be52c04105df3e2411",
  },
  Transfer: {
    topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  },
};

const Factories = {
  arbitrum: {
    address: "0x14920Eb11b71873d01c93B589b40585dacfCA096",
    fromBlock: 322193553,
  },
  bsc: {
    address: "0x8Df05E11e72378c1710e296450Bf6b72e2F12019",
    fromBlock: 50519690,
  },
  ethereum: {
    address: "0x37Ba9934aAbA7a49cC29d0952C6a91d7c7043dbc",
    fromBlock: 22174761,
  },
};

interface Market {
  ftAddr: string;
  treasurerAddr: string;
  underlyingAddr: string;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    target: Factories[options.chain].address,
    eventAbi: Events.CreateMarket.eventAbi,
    topic: Events.CreateMarket.topic,
    fromBlock: Factories[options.chain].fromBlock,
  });
  const marketAddresses = logs.map((log) => log[0]);

  const [allConfigs, allTokens] = await Promise.all([
    options.fromApi.multiCall({
      calls: marketAddresses,
      abi: ABIS.Market.config,
    }),
    options.fromApi.multiCall({
      calls: marketAddresses,
      abi: ABIS.Market.tokens,
    }),
  ]);

  const markets: Market[] = [];
  for (let i = 0; i < marketAddresses.length; i++) {
    const config = allConfigs[i];
    const tokens = allTokens[i];
    if (config && tokens) {
      markets.push({
        ftAddr: tokens[0],
        treasurerAddr: config[0],
        underlyingAddr: tokens[4],
      });
    }
  }

  const treasurerAddrs = Array.from(
    new Set(markets.map((m) => m.treasurerAddr))
  );
  const promises: Promise<void>[] = [];
  for (const treasurerAddr of treasurerAddrs) {
    const task = async () => {
      const market = markets.find((m) => m.treasurerAddr === treasurerAddr);
      if (!market) return;

      const logs = (await options.toApi.getLogs({
        targets: markets.map((market) => market.ftAddr),
        topics: [
          Events.Transfer.topic,
          null,
          zeroPadValue(treasurerAddr.toLowerCase(), 32),
        ],
        fromTimestamp: options.fromTimestamp,
        toTimestamp: options.toTimestamp,
      })) as EventLog[];
      for (const log of logs) {
        dailyFees.add(market.underlyingAddr, BigInt(log.data));
      }
    };
    promises.push(task());
  }
  await Promise.all(promises);

  return { dailyFees };
};

const methodology = {
  dailyFees:
    "Fees collected by the TermMax protocol from users, distributed to the treasury",
};

const adapters: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-04-15",
      meta: { methodology },
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2025-04-15",
      meta: { methodology },
    },
    [CHAIN.BSC]: {
      fetch,
      start: "2025-05-30",
      meta: { methodology },
    },
  },
};

export default adapters;
