import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MATCHING = "0x227adD7CDe4E7996D9f02975CC16212f19664C03";
const X18 = 1e18;

const ordersMatchedAbi =
  "event OrdersMatched(uint16 indexed marketIndex, address indexed maker, address indexed taker, uint8 makerSide, uint64 makerNonce, uint64 takerNonce, uint128 size, uint128 price)";

const fetch = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: MATCHING,
    eventAbi: ordersMatchedAbi,
  });

  let dailyVolume = 0;
  for (const log of logs) {
    const size = Number(log.size) / X18;
    const price = Number(log.price) / X18;
    dailyVolume += size * price;
  }

  return { dailyVolume };
};

const methodology = {
  Volume: "Notional volume from on-chain OrdersMatched events on the Matching contract.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.MONAD],
  fetch,
  start: "2026-06-20",
  methodology,
};

export default adapter;
