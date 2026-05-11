import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FEE_RECIPIENT = "0x6A80f57ac54123cB71e6c79B3935A381b87B4308";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const START_DATE: Record<string, string> = {
  [CHAIN.BSC]:      "2026-03-17",
  [CHAIN.BASE]:     "2026-04-22",
  [CHAIN.ETHEREUM]: "2026-05-05",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  try {
    const recipientTopic =
      "0x" + "0".repeat(24) + FEE_RECIPIENT.slice(2).toLowerCase();

    const logs = await options.getLogs({
      noTarget: true,
      topics: [TRANSFER_TOPIC, null as any, recipientTopic],
    });

    for (const log of logs as any[]) {
      dailyVolume.add(log.address, BigInt(log.data) * BigInt(400));
    }
  } catch (err) {
    console.error(`[ALLOX:volume] getLogs failed on chain:`, err);
    // Return 0 volume for this chain so other chains keep working.
  }

  return { dailyVolume };
};

const adapter: Adapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.keys(START_DATE).map((chain) => [
      chain,
      {
        fetch,
        start: START_DATE[chain],
        pullHourly: true,
        meta: {
          methodology: {
            Volume:
              "Total USD value of swaps AlloX routed through Uniswap " +
              "(V2/V3/V4 Universal Router) and PancakeSwap (Universal Router). " +
              "Derived from ERC20 Transfer events landing at the fee recipient " +
              `(${FEE_RECIPIENT}). AlloX takes a fixed 0.25% portion of each ` +
              "swap output via PAY_PORTION / V4 TAKE_PORTION, so daily volume " +
              "= sum of recipient inflows × 400.",
          },
        },
      },
    ])
  ),
};

export default adapter;
