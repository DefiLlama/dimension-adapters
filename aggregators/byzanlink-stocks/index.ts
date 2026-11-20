import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const BYZANLINK_SOURCE = "dhgh7VRLtcqZXySwtUwRU5CeFopHsZc7";
const BYZANLINK_INTEGRATOR = "0x5bf9e1af9eaFe63344FBB3D227503f9EB80D2B17".toLowerCase();

const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const DZAP_ROUTER = "0xF708e11A7C94abdE8f6217B13e6fE39C8b9cC0a6";

const DZAP_SWAP_INFO =
  "(string dex, address callTo, address recipient, address fromToken, address toToken, uint256 fromAmount, uint256 returnToAmount)";
const DZAP_SWAPPED = `event DZapTokenSwapped(bytes32 indexed transactionId, address indexed sender, address indexed integrator, ${DZAP_SWAP_INFO} swapInfo)`;
const DZAP_BATCH_SWAPPED = `event DZapBatchTokenSwapped(bytes32 indexed transactionId, address indexed sender, address indexed integrator, ${DZAP_SWAP_INFO}[] swapInfo)`;

const chainConfig: Record<string, { start: string; kyberRouter?: string; dzapRouter?: string }> = {
  [CHAIN.BASE]: { start: "2026-10-22", kyberRouter: KYBER_ROUTER, dzapRouter: DZAP_ROUTER },
  [CHAIN.ARBITRUM]: { start: "2026-11-19", kyberRouter: KYBER_ROUTER },
  [CHAIN.ROBINHOOD]: { start: "2026-11-19", kyberRouter: KYBER_ROUTER },
  [CHAIN.OPTIMISM]: { start: "2026-11-19", kyberRouter: KYBER_ROUTER },
  [CHAIN.POLYGON]: { start: "2026-11-19", kyberRouter: KYBER_ROUTER },
};

const isByzanlink = (clientData: string) => {
  try {
    const { Source } = JSON.parse(Buffer.from(clientData.slice(2), "hex").toString());
    return typeof Source === "string" && Source.toLowerCase() === BYZANLINK_SOURCE.toLowerCase();
  } catch {
    return false;
  }
};

const addKyberVolume = async (options: FetchOptions, dailyVolume: any, router: string) => {
  const swaps = await options.getLogs({
    target: router,
    eventAbi:
      "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)",
    onlyArgs: false,
  });
  const clientData = await options.getLogs({
    target: router,
    eventAbi: "event ClientData(bytes clientData)",
    onlyArgs: false,
  });

  const byTx = new Map<string, any[]>();
  for (const log of [...swaps, ...clientData]) {
    const tx = log.transactionHash.toLowerCase();
    byTx.set(tx, [...(byTx.get(tx) ?? []), log]);
  }

  for (const logs of byTx.values()) {
    logs.sort((a, b) => a.logIndex - b.logIndex);
    // skip wash trades
    const txSwaps = logs.filter((log) => log.args.spentAmount !== undefined).map((log) => log.args);
    const received = new Set(txSwaps.map((swap) => swap.dstToken.toLowerCase()));
    if (txSwaps.length > 1 && txSwaps.every((swap) => received.has(swap.srcToken.toLowerCase()))) continue;
    let pending: any = null;
    for (const log of logs) {
      if (log.args.spentAmount !== undefined) {
        pending = log.args;
        continue;
      }
      if (pending && isByzanlink(log.args.clientData)) {
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

export const addDzapVolume = async (options: FetchOptions, dailyVolume: any, router: string = DZAP_ROUTER) => {
  const single = await options.getLogs({ target: router, eventAbi: DZAP_SWAPPED, onlyArgs: true });
  const batch = await options.getLogs({ target: router, eventAbi: DZAP_BATCH_SWAPPED, onlyArgs: true });

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
  const { kyberRouter, dzapRouter } = chainConfig[options.chain];
  if (kyberRouter) await addKyberVolume(options, dailyVolume, kyberRouter);
  if (dzapRouter) await addDzapVolume(options, dailyVolume, dzapRouter);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  doublecounted: true,
  methodology: {
    Volume: "Value of token swaps made on Byzanlink, routed through KyberSwap or DZap, priced on one side of each swap. Wash trades through KyberSwap are excluded.",
  },
  breakdownMethodology: {
    Volume: {
      KyberSwap: "Swaps routed through the KyberSwap MetaAggregationRouterV2 with the Byzanlink source, excluding wash trades.",
      DZap: "Swaps routed through the DZap router with the Byzanlink integrator.",
    },
  },
};

export default adapter;
