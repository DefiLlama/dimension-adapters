import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryEvents } from "../../helpers/sui";

// api.flowx.finance exchangeStats.volume24H has returned 0 since at least 2026-08 while the v2 AMM
// keeps swapping, so volume is read from the on-chain Swapped events (same source as fees/flowx-finance).
const SWAPPED_EVENT = "0xba153169476e8c3114962261d1edc70de5ad9781b83cc617ecc8c1923191cae0::pair::Swapped";

const withPrefix = (coin: string) => (coin.startsWith("0x") ? coin : "0x" + coin);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const events: any[] = await queryEvents({ eventType: SWAPPED_EVENT, options });

  for (const e of events) {
    const xIn = BigInt(e.amount_x_in ?? 0);
    const yIn = BigInt(e.amount_y_in ?? 0);
    const [coin, amountIn] = xIn > 0n ? [e.coin_x, xIn] : [e.coin_y, yIn];
    if (amountIn <= 0n) continue;
    dailyVolume.add(withPrefix(coin), amountIn);
  }

  return { dailyVolume };
};

const methodology = {
  Volume: "Sum of the input amount of every swap on the FlowX v2 AMM, from on-chain Swapped events.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: '2023-01-13',
  methodology,
  pullHourly: true, 
};

export default adapter;
