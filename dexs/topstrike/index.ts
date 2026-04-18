import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTRACT = "0xf3393dC9E747225FcA0d61BfE588ba2838AFb077";

const TRADE_EVENT_ABI =
  "event Trade(address indexed trader, uint256 indexed playerId, bool isBuy, uint256 amountInUnits, uint256 priceInWei, uint256 feeInWei, uint256 newSupplyInUnits, bool isIPOWindow)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    target: CONTRACT,
    eventAbi: TRADE_EVENT_ABI,
  });

  for (const log of logs) {
    // Buy:  priceInWei is gross (includes IPO fees when active)
    // Sell: priceInWei is net; gross = priceInWei + feeInWei
    const gross = log.isBuy
      ? BigInt(log.priceInWei)
      : BigInt(log.priceInWei) + BigInt(log.feeInWei);
    dailyVolume.addGasToken(gross);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: "2026-01-11",
    },
  },
};

export default adapter;
