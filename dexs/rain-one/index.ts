import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const rainFactories: { address: string; fromBlock: number; toBlock?: number }[] = [
  // retired factory
  { address: "0xccCB3C03D9355B01883779EF15C1Be09cf3623F1", fromBlock: 307026817, toBlock: 446061342 },
  // active factory
  { address: "0xA8640B62D755e42C9ed6A86d0fc65CE09e31F264", fromBlock: 446257605 },
];

const enterOptionEvent =
  "event EnterOption(uint256 option, uint256 baseAmount, uint256 optionAmount,address indexed wallet)";
const poolCreatedEvent =
  "event PoolCreated(address indexed poolAddress, address indexed poolCreator, string uri)";
const poolTokenSetEvent =
  "event PoolTokenSet(address indexed poolAddress,address indexed tokenAddress,uint256 tokenDecimals,string tokenName,string tokenSymbol)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();

  const poolCreationLogs: any[] = [];
  for (const factory of rainFactories) {
    const logs = await options.getLogs({
      target: factory.address,
      eventAbi: poolCreatedEvent,
      fromBlock: factory.fromBlock,
      toBlock: factory.toBlock,
      cacheInCloud: true,
    });
    poolCreationLogs.push(...logs);
  }

  const pools = poolCreationLogs.map((log) => log.poolAddress);

  const poolTokenSetLogs: any[] = [];
  for (const factory of rainFactories) {
    const logs = await options.getLogs({
      target: factory.address,
      eventAbi: poolTokenSetEvent,
      fromBlock: factory.fromBlock,
      toBlock: factory.toBlock,
      cacheInCloud: true,
    });
    poolTokenSetLogs.push(...logs);
  }

  const poolTokenMap: Record<string, { token: string; decimals: number }> = {};

  poolTokenSetLogs.forEach((log) => {
    poolTokenMap[log.poolAddress.toLowerCase()] = {
      token: log.tokenAddress.toLowerCase(),
      decimals: Number(log.tokenDecimals),
    };
  });
  
  // bug fix missing log
  poolTokenMap['0x1cd385293d30d2b77ba9fa777ef1470b5312dae9'] = {
    token: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    decimals: 6,
  }

  await options.streamLogs({
    noTarget: true,
    eventAbi: enterOptionEvent,
    entireLog: true,
    targetsFilter: pools,
    processor: (logs) => {
      console.log(`Processed ${Array.isArray(logs) ? logs.length : 1} enterOption logs`)
      logs.forEach((log: any) => {
        const pool = log.address.toLowerCase();
        const tokenInfo = poolTokenMap[pool]
        if (!tokenInfo) throw new Error(`Token info not found for pool ${pool}`);
        dailyVolume.addToken(tokenInfo?.token, log.args.baseAmount);
        dailyNotionalVolume.addToken(tokenInfo.token, log.args.optionAmount);
      })
    }
  })

  return { dailyVolume, dailyNotionalVolume };
};

const methodology = {
  Volume: "All Market Trades On https://rain.one",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2025-02-17",
  methodology,
  pullHourly: true,
};

export default adapter;
