import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const EXECUTORS = [
  "0x2c0552e5dcb79b064fd23e358a86810bc5994244",
  "0x2141af658ffda533da864dd11b2ffdb8529c8b94",
  "0xb2f72662ed42067ccce278f8462a0215b6adcabb",
];

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const executorSet = new Set(EXECUTORS.map(e => e.toLowerCase()));

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyVolume = createBalances();
  const allLogs: any[] = [];

  for (const executor of EXECUTORS) {
    const padded = ethers.zeroPadValue(executor, 32);

    const logs = await getLogs({
      topics: [TRANSFER_TOPIC, null as any, padded],
      noTarget: true,
      eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
      entireLog: true,
    });

    for (const log of logs) {
      if (log.data === "0x") continue;
      const from = "0x" + log.topics[1].slice(26).toLowerCase();
      if (executorSet.has(from)) continue;
      allLogs.push(log);
    }
  }

  // Per transaction: keep only the first Transfer (lowest log index).
  // This is the sell-token inflow from the user, before any DEX routing
  // or multi-hop returns inflate the count.
  const firstByTx: Record<string, any> = {};
  for (const log of allLogs) {
    const txHash = log.transactionHash.toLowerCase();
    const idx = log.logIndex ?? log.index ?? 0;
    const prev = firstByTx[txHash];
    if (!prev || idx < (prev.logIndex ?? prev.index ?? 0)) {
      firstByTx[txHash] = log;
    }
  }

  for (const log of Object.values(firstByTx)) {
    dailyVolume.add(log.address, log.data);
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "For each transaction involving a Barter executor, the first ERC-20 Transfer " +
    "received by the executor (by log index) is taken as the sell-side volume. " +
    "Subsequent transfers (DEX returns, multi-hop intermediates) are excluded.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2023-01-01" },
  },
  methodology,
};

export default adapter;
