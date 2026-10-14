import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Byzanlink stock trades are routed through KyberSwap with source "byzanlink", written to the router's ClientData event
// sample: https://basescan.org/tx/0xb308f1dd3be481b8ab9ef162a5def8eabc3755c63e8671f8532247fef36acb1e#eventlog
const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const USDC = ADDRESSES.base.USDC.toLowerCase();

const isByzanlink = (clientData: string) => Buffer.from(clientData.slice(2), "hex").toString().includes('"Source":"byzanlink"');

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
        // counted on the USDC leg
        if (pending.srcToken.toLowerCase() === USDC) dailyVolume.add(USDC, pending.spentAmount);
        else if (pending.dstToken.toLowerCase() === USDC) dailyVolume.add(USDC, pending.returnAmount);
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
  start: "2026-10-07",
  doublecounted: true, // executed by the KyberSwap router
  methodology: {
    Volume: "USDC value of tokenized stock buys and sells made on Byzanlink, routed through KyberSwap on Base.",
  },
};

export default adapter;
