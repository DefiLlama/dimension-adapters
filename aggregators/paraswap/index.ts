// https://developers.paraswap.network/smart-contracts
const chains = [
  "ethereum",
  "arbitrum",
  "avax",
  "bsc",
  "fantom",
  "optimism",
  "polygon",
  "base",
  "polygon_zkevm",
];

import { ChainBlocks, FetchOptions } from "../../adapters/types";

const abis = {
  "SwappedDirect": "event SwappedDirect(bytes16 uuid, address partner, uint256 feePercent, address initiator, uint8 kind, address indexed beneficiary, address indexed srcToken, address indexed destToken, uint256 srcAmount, uint256 receivedAmount, uint256 expectedAmount)",
  "SwappedV3": "event SwappedV3(bytes16 uuid, address partner, uint256 feePercent, address initiator, address indexed beneficiary, address indexed srcToken, address indexed destToken, uint256 srcAmount, uint256 receivedAmount, uint256 expectedAmount)",
}

const defaultSwapper = '0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57'
const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, chain, }: FetchOptions) => {
  const dailyVolume = createBalances()
  let target = defaultSwapper
  if (chain === "polygon_zkevm") target = '0xb83b554730d29ce4cb55bb42206c3e2c03e4a40a'
  const swappedDirectLogs = await getLogs({ target, eventAbi: abis.SwappedDirect, })
  const swappedV3Logs = await getLogs({ target, eventAbi: abis.SwappedV3, });
  [swappedDirectLogs, swappedV3Logs].flat().forEach((log: any) => {
    dailyVolume.add(log.destToken, log.receivedAmount)
  })
  return { timestamp, dailyVolume }
};

const adapter: any = { adapter: {}, };

chains.forEach((chain) => adapter.adapter[chain] = { fetch, start: 1676592000, });

export default adapter;
