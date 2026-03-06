import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const EXECUTORS = [
  "0x2c0552e5dcb79b064fd23e358a86810bc5994244",
  "0x2141af658ffda533da864dd11b2ffdb8529c8b94",
  "0xb2f72662ed42067ccce278f8462a0215b6adcabb",
];

const executorSet = new Set(EXECUTORS.map(e => e.toLowerCase()));

const fetch = async (options: FetchOptions) => {
  // One transfer per tx: avoids double-counting buy-token returns
  // from DEXes and intermediate hops through the executor.
  const seenTx = new Set<string>();

  const dailyVolume = await addTokensReceived({
    options,
    targets: EXECUTORS,
    logFilter: (log: any) => {
      const from = (log.from || log.sender || "").toLowerCase();
      if (executorSet.has(from)) return false;

      const txHash = (log.txHash || log.transactionHash || "").toLowerCase();
      if (!txHash || seenTx.has(txHash)) return false;
      seenTx.add(txHash);
      return true;
    },
  });

  return { dailyVolume };
};

const methodology = {
  Volume:
    "For each transaction, counts only the first ERC-20 transfer received " +
    "by a Barter executor — the sell-side token sent by the user. " +
    "Subsequent transfers (DEX returns, multi-hop intermediates) are excluded.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2023-01-01" },
  },
  methodology,
};

export default adapter;
