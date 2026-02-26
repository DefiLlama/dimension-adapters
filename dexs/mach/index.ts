import { FetchOptions, SimpleAdapter } from "../../adapters/types";

import { DEPLOYMENTS } from "./deployments.ts";

// struct OrderDirection {
//     address srcAsset;
//     address dstAsset;
//     uint32 dstLzc;
// }
// 
// event MatchExecuted(address indexed bonder, OrderDirection direction, uint32 srcIndex, uint32 dstIndex, uint96 srcQuantity, uint96 dstQuantity, address Taker, bool isWrapped)

const EVENT_MATCH_EXECUTED = "event MatchExecuted(address indexed bonder, (address srcAsset, address dstAsset, uint32 dstLzc) direction, uint32 srcIndex, uint32 dstIndex, uint96 srcQuantity, uint96 dstQuantity, address taker, bool isWrapped)";

async function fetch({ chain, getLogs, createBalances }: FetchOptions) {
  const address = DEPLOYMENTS[chain].address;

  const logs = await getLogs({
    target: address,
    eventAbi: EVENT_MATCH_EXECUTED,
  })

  const dailyVolume = createBalances()

  for (const log of logs) {
    dailyVolume.add(log.direction.srcAsset, log.srcQuantity)
  }

  return { dailyVolume }
}

const adapters = {}

for (const [chain, { start }] of Object.entries(DEPLOYMENTS)) {
  adapters[chain] = { fetch, start }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: adapters,
}

export default adapter;