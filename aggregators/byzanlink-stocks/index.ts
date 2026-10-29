import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const BYZANLINK_SOURCE = "dhgh7VRLtcqZXySwtUwRU5CeFopHsZc7"; // Byzanlink source

const DZAP_ROUTER = "0xF708e11A7C94abdE8f6217B13e6fE39C8b9cC0a6";
const BYZANLINK_INTEGRATOR = "0x5bf9e1af9eaFe63344FBB3D227503f9EB80D2B17".toLowerCase();
const DZAP_SWAP_INFO =
  "(string dex, address callTo, address recipient, address fromToken, address toToken, uint256 fromAmount, uint256 returnToAmount)";
const DZAP_SWAPPED = `event DZapTokenSwapped(bytes32 indexed transactionId, address indexed sender, address indexed integrator, ${DZAP_SWAP_INFO} swapInfo)`;
const DZAP_BATCH_SWAPPED = `event DZapBatchTokenSwapped(bytes32 indexed transactionId, address indexed sender, address indexed integrator, ${DZAP_SWAP_INFO}[] swapInfo)`;

const isByzanlink = (clientData: string) =>
  Buffer.from(clientData.slice(2), "hex").toString().includes(`"Source":"${BYZANLINK_SOURCE}"`);

const addKyberVolume = async (options: FetchOptions, dailyVolume: any) => {
  const swaps = await options.getLogs({
    target: KYBER_ROUTER,
    eventAbi:
      "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)",
    onlyArgs: false,
  });
  const clientData = await options.getLogs({
    target: KYBER_ROUTER,
    eventAbi: "event ClientData(bytes clientData)",
    onlyArgs: false,
  });

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
        addOneToken({
          balances: dailyVolume,
          token0: pending.srcToken,
          amount0: pending.spentAmount,
          token1: pending.dstToken,
          amount1: pending.returnAmount,
          label: "KyberSwap",
        });
      }
      pending = null;
    }
  }
};

export const addDzapVolume = async (options: FetchOptions, dailyVolume: any) => {
  const single = await options.getLogs({ target: DZAP_ROUTER, eventAbi: DZAP_SWAPPED, onlyArgs: true });
  const batch = await options.getLogs({ target: DZAP_ROUTER, eventAbi: DZAP_BATCH_SWAPPED, onlyArgs: true });

  const swapInfos = [
    ...single
      .filter((args: any) => args.integrator.toLowerCase() === BYZANLINK_INTEGRATOR)
      .map((args: any) => args.swapInfo),
    ...batch
      .filter((args: any) => args.integrator.toLowerCase() === BYZANLINK_INTEGRATOR)
      .flatMap((args: any) => args.swapInfo),
  ];
  for (const swapInfo of swapInfos) {
    addOneToken({
      balances: dailyVolume,
      token0: swapInfo.fromToken,
      amount0: swapInfo.fromAmount,
      token1: swapInfo.toToken,
      amount1: swapInfo.returnToAmount,
      label: "DZap",
    });
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  await addKyberVolume(options, dailyVolume);
  await addDzapVolume(options, dailyVolume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-10-22",
  doublecounted: true, // executed by the KyberSwap and DZap routers
  methodology: {
    Volume:
      "Value of tokenized stock buys and sells made on Byzanlink, routed through KyberSwap or DZap on Base, priced on one side of each swap.",
  },
  breakdownMethodology: {
    Volume: {
      KyberSwap: "Stock trades routed through the KyberSwap MetaAggregationRouterV2 with the Byzanlink source.",
      DZap: "Stock trades routed through the DZap router with the Byzanlink source.",
    },
  },
};

export default adapter;
