import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ZeroAddress } from "ethers";

const ROUTER_CONTRACT = '0xbEF0110560921824AF49dE900f2f0bF9ceb87E8C';
const TRADE_TOPIC = '0xaba723c41393affffc6e975a8a24df016aaf3f97d475b9a48664648daf86fb2b';
const CONTRACT_PROVIDER = '0xB5855E692465B6c1B5172fCaF59Ac67F20621A4d';
const ABI = {
  getMarketAddresses: "function getMarketAddresses(uint256 offset, uint256 limit) view returns (address[])",
  getCollateralManager: "function getCollateralManager() view returns (address)",
  getUnderlyingToken: "function getUnderlyingToken() view returns (address)",
  getMarketIdByAddress: "function getMarketIdByAddress(address) view returns (bytes32)",
};

async function getMarketIdToTokenMap(
  options: FetchOptions,
  registryAddress: string
): Promise<Record<string, string>> {
  const markets = await options.api.call({
    abi: ABI.getMarketAddresses,
    target: registryAddress,
    params: [0, 1000],
  });

  const collateralManagers = await options.api.multiCall({
    abi: ABI.getCollateralManager,
    calls: markets.map(addr => ({ target: addr })),
  });

  const tokens = await options.api.multiCall({
    abi: ABI.getUnderlyingToken,
    calls: collateralManagers.map(addr => ({ target: addr })),
  });

  const marketIds = await options.api.multiCall({
    abi: ABI.getMarketIdByAddress,
    calls: markets.map(addr => ({ target: registryAddress, params: [addr] })),
  });

  const result: Record<string, string> = {};

  for (let i = 0; i < markets.length; i++) {
    const token = tokens[i];
    const marketId = marketIds[i];
    if (marketId && token && token !== ZeroAddress) {
      result[marketId.toLowerCase()] = token.toLowerCase();
    }
  }

  return result;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs: any[] = await options.getLogs({
    target: ROUTER_CONTRACT,
    topics: [TRADE_TOPIC],
  });

  const seen = new Set<string>();
  const marketToToken = await getMarketIdToTokenMap(options, CONTRACT_PROVIDER);

  for (const log of logs) {
    const logId = `${log.transactionHash}_${log.logIndex}`;
    if (seen.has(logId)) continue;
    seen.add(logId);

    const marketId = log.topics[1].toLowerCase();
    const token = marketToToken[marketId];
    if (!token) continue;

    const logData = log.data.slice(2); // remove '0x'
    const notionalHex = logData.slice(64, 128);
    const notional = BigInt(`0x${notionalHex}`);

    dailyVolume.add(token, notional);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-10-29',
    },
  },
};

export default adapter;