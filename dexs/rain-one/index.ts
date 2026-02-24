import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const rainFactory = "0xccCB3C03D9355B01883779EF15C1Be09cf3623F1";

const enterOptionEvent =
  "event EnterOption(uint256 option, uint256 baseAmount, uint256 optionAmount,address indexed wallet)";
const poolCreatedEvent =
  "event PoolCreated(address indexed poolAddress, address indexed poolCreator, string uri)";
const poolTokenSetEvent =
  "event PoolTokenSet(address indexed poolAddress,address indexed tokenAddress,uint256 tokenDecimals,string tokenName,string tokenSymbol)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const poolCreationLogs = await options.getLogs({
    target: rainFactory,
    eventAbi: poolCreatedEvent,
    fromBlock: 307026817,
    cacheInCloud: true,
  });

  const pools = poolCreationLogs.map((log) => log.poolAddress);

  const poolsEndTime = await options.api.multiCall({ abi: "uint256:endTime", calls: pools, });

  const filteredPools = pools.filter((_, i) => poolsEndTime[i] >= options.fromTimestamp,);

  const poolTokenSetLogs = await options.getLogs({
    target: rainFactory,
    eventAbi: poolTokenSetEvent,
    fromBlock: 307026817,
    cacheInCloud: true,
  });

  const poolTokenMap: Record<string, { token: string; decimals: number }> = {};

  poolTokenSetLogs.forEach((log) => {
    poolTokenMap[log.poolAddress.toLowerCase()] = {
      token: log.tokenAddress.toLowerCase(),
      decimals: Number(log.tokenDecimals),
    };
  });

  await options.streamLogs({
    noTarget: true,
    eventAbi: enterOptionEvent,
    entireLog: true,
    targetsFilter: filteredPools,
    processor: (logs) => {
      console.log(`Processed ${Array.isArray(logs) ? logs.length : 1} enterOption logs`)
      logs.forEach((log: any) => {
        const pool = log.address.toLowerCase();
        const tokenInfo = poolTokenMap[pool]
        if (!tokenInfo) throw new Error(`Token info not found for pool ${pool}`);
          dailyVolume.addToken(tokenInfo?.token, log.args.baseAmount);
      })
    }
  })

  return { dailyVolume, }
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
