import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FEE_RECIPIENT = "0x6A80f57ac54123cB71e6c79B3935A381b87B4308";

const MESSAGE_CONTRACTS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xd33f10222a9783d30cb3a4dab51fed1a045c81e0",
  [CHAIN.BSC]:      "0x0b3e65149C84A0aB56B199DeA3C48965a0569225",
  [CHAIN.BASE]:     "0xf3e05a607c97006b37d2b2789e17c3a832ba56f0",
};

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const START_DATE: Record<string, string> = {
  [CHAIN.BSC]:      "2026-03-17",
  [CHAIN.BASE]:     "2026-04-22",
  [CHAIN.ETHEREUM]: "2026-05-05",
};

const padAddress = (addr: string): string =>
  "0x" + "0".repeat(24) + addr.slice(2).toLowerCase();

const fetch = (chain: string) => async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // 1) Swap fees — 0.25% of every swap output collected at FEE_RECIPIENT.
  try {
    const swapLogs = await options.getLogs({
      noTarget: true,
      topics: [TRANSFER_TOPIC, null as any, padAddress(FEE_RECIPIENT)],
    });
    for (const log of swapLogs as any[]) {
      dailyFees.add(log.address, BigInt(log.data), "swap");
    }
  } catch (err) {
    console.error(`[ALLOX:fees:swap] getLogs failed on ${chain}:`, err);
  }

  // 2) Chat-message purchase revenue (per-chain contract).
  const messageContract = MESSAGE_CONTRACTS[chain];
  if (messageContract) {
    try {
      const msgLogs = await options.getLogs({
        noTarget: true,
        topics: [TRANSFER_TOPIC, null as any, padAddress(messageContract)],
      });
      for (const log of msgLogs as any[]) {
        dailyFees.add(log.address, BigInt(log.data), "messages");
      }
    } catch (err) {
      console.error(`[ALLOX:fees:messages] getLogs failed on ${chain}:`, err);
    }
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.keys(START_DATE).map((chain) => [
      chain,
      {
        fetch: fetch(chain),
        start: START_DATE[chain],
        pullHourly: true,
        meta: {
          methodology: {
            Fees:
              "Two streams aggregated:\n" +
              `1) Swap fees: 0.25% of every swap output collected at ${FEE_RECIPIENT}.\n` +
              "2) Chat-message revenue: user payments to the AlloX message-purchase contract on each chain.",
            Revenue: "AlloX retains 100% of fees (no third-party LP cut). Revenue == Fees.",
          },
          breakdownMethodology: {
            Fees: {
              swap: `0.25% of swap output collected at ${FEE_RECIPIENT}.`,
              messages: "User payments for chat-message credits sent to the AlloX message-purchase contract on each chain.",
            },
            Revenue: {
              swap: "Same as swap fees (AlloX retains 100%).",
              messages: "Same as message fees (AlloX retains 100%).",
            },
          },
        },
      },
    ])
  ),
};

export default adapter;
