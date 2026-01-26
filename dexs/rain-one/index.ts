import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import coreAssets from "../../helpers/coreAssets.json";

const usdt = coreAssets.arbitrum.USDT;
const rainFactory = "0xccCB3C03D9355B01883779EF15C1Be09cf3623F1";
const enterOptionEvent =
  "event EnterOption(uint256 option, uint256 baseAmount, uint256 optionAmount,address indexed wallet)";
const poolCreatedEvent =
  "event PoolCreated(address indexed poolAddress, address indexed poolCreator, string uri)";
const poolTokenSetEvent =
  "event PoolTokenSet(address indexed poolAddress,address indexed tokenAddress,uint256 tokenDecimals,string tokenName,string tokenSymbol)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const poolCreationLogs = await options.api.getLogs({
    target: rainFactory,
    eventAbi: poolCreatedEvent,
    fromBlock: 307026817,
    toTimestamp: options.toTimestamp,
    cacheInCloud: true,
  });

  const pools = poolCreationLogs.map((log) => log.args.poolAddress);

  const poolsEndTime = await options.api.multiCall({
    abi: "uint256:endTime",
    calls: pools,
  });

  const filteredPools = pools.filter(
    (_, i) => poolsEndTime[i] >= options.fromTimestamp,
  );

  const poolTokenSetLogs = await options.api.getLogs({
    target: rainFactory,
    eventAbi: poolTokenSetEvent,
    fromBlock: 307026817,
    toTimestamp: options.toTimestamp,
    cacheInCloud: true,
  });

  const poolTokenMap: Record<string, { token: string; decimals: number }> = {};

  poolTokenSetLogs.forEach((log) => {
    poolTokenMap[log.args.poolAddress.toLowerCase()] = {
      token: log.args.tokenAddress.toLowerCase(),
      decimals: Number(log.args.tokenDecimals),
    };
  });

  const enterOptionLogs = await options.getLogs({
    targets: filteredPools,
    eventAbi: enterOptionEvent,
    entireLog: true,
  });

  enterOptionLogs.forEach((log) => {
    const pool = log.address.toLowerCase();
    const tokenInfo = poolTokenMap[pool] ?? {
      token: usdt,
      decimals: 6,
    };
    dailyVolume.addToken(tokenInfo?.token, log.args.baseAmount);
  });
  return { dailyVolume };
};

const methodology = {
  Volume: "All trades on prediction markets",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2025-02-17",
  methodology,
};

export default adapter;
