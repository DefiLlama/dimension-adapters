import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const BYZANLINK_SOURCE = "dhgh7VRLtcqZXySwtUwRU5CeFopHsZc7"; // Byzanlink source

const isByzanlink = (clientData: string) => Buffer.from(clientData.slice(2), "hex").toString().includes(`"Source":"${BYZANLINK_SOURCE}"`);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const swaps = await options.getLogs({ target: KYBER_ROUTER, eventAbi: "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)", onlyArgs: false });
  const clientData = await options.getLogs({ target: KYBER_ROUTER, eventAbi: "event ClientData(bytes clientData)", onlyArgs: false });

  const byTx = new Map<string, any[]>();
  for (const log of [...swaps, ...clientData]) {
    const tx = log.transactionHash.toLowerCase();
    byTx.set(tx, [...(byTx.get(tx) ?? []), log]);
  }

  // the router emits Swapped, then ClientData of the same swap call
  for (const logs of byTx.values()) {
    logs.sort((a, b) => a.logIndex - b.logIndex);
    let pending: any = null;
    for (const log of logs) {
      if (log.args.spentAmount !== undefined) {
        pending = log.args;
        continue;
      }
      if (pending && isByzanlink(log.args.clientData)) {
        // counted once per swap, on the core-asset leg when there is one
        addOneToken({ balances: dailyVolume, token0: pending.srcToken, amount0: pending.spentAmount, token1: pending.dstToken, amount1: pending.returnAmount, label: "KyberSwap" });
      }
      pending = null;
    }
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-10-22",
  doublecounted: true, // executed by the KyberSwap router
  methodology: {
    Volume: "Value of tokenized stock buys and sells made on Byzanlink, routed through KyberSwap on Base, priced on one side of each swap.",
  },
  breakdownMethodology: {
    Volume: {
      KyberSwap: "Stock trades routed through the KyberSwap MetaAggregationRouterV2 with the Byzanlink source.",
    },
  },
};

export default adapter;
