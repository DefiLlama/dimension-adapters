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

const EVENT_V2_MATCH_CREATED = "event MatchCreated(address indexed bonder, (address srcAsset, bytes32 dstAsset, uint32 dstLzc) direction, uint32 orderIndex, uint96 srcQuantity, uint96 dstQuantity, address taker, bytes32 maker, uint96 blockNumber)";
const EVENT_V2_SWAP_FILLED = "event SwapFilled(address indexed maker, (address srcAsset, bytes32 dstAsset, uint32 dstLzc) direction, uint32 orderIndex, uint96 srcQuantity, uint96 dstQuantity, address taker, address target, uint96 blockNumber)";

async function fetch({ chain, getLogs, createBalances }: FetchOptions) {
  const { address, v2Address } = DEPLOYMENTS[chain];

  const dailyVolume = createBalances()

  if (address) {
    const logs = await getLogs({
      target: address,
      eventAbi: EVENT_MATCH_EXECUTED,
    })

    for (const log of logs) {
      dailyVolume.add(log.direction.srcAsset, log.srcQuantity)
    }
  }

  if (v2Address) {
    const [matches, swaps] = await Promise.all([
      getLogs({ target: v2Address, eventAbi: EVENT_V2_MATCH_CREATED }),
      getLogs({ target: v2Address, eventAbi: EVENT_V2_SWAP_FILLED }),
    ])

    for (const log of matches.concat(swaps)) {
      dailyVolume.add(log.direction.srcAsset, log.srcQuantity)
    }
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
  deadFrom: '2026-02-20',
  methodology: {
    Volume: "Swaps settled on Mach's order book contracts. Order Book (until Dec 2024): amount paid out to the taker on the destination chain (MatchExecuted). Order Book V2 (Jan 2025 - Feb 2026): the taker's input on the source chain when a cross-chain order is matched (MatchCreated), plus single-chain fills (SwapFilled).",
  },
}

export default adapter;