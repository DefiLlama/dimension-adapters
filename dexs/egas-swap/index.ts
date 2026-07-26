import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SWAP_PROXY = "0x37ccd90ed5fa96207b41c4fbcb90b883e30e63dc";

const TOKEN_EXCHANGED_EVENT = `event TokenExchanged(address indexed user, bool indexed isBuy, address indexed tokenAddress, uint256 fromAmount, uint256 toAmount)`;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs: any[] = await options.getLogs({
    target: SWAP_PROXY,
    eventAbi: TOKEN_EXCHANGED_EVENT
  });

  // Each conversion emits two legs: a buy (token into the proxy) and an
  // offsetting sell (token out). Count only the buy leg to avoid 2x volume.
  for (const log of logs) {
    if (!log.isBuy) continue;
    const token = (log.tokenAddress as string)?.toLowerCase();
    if (!token) continue;
    dailyVolume.add(token, log.fromAmount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ENI],
  fetch,
  start: "2025-06-09",
  methodology: {
    Volume:
      "Swap volume from the TokenExchanged events emitted by the EGAS Swap proxy. " +
      "Each swap emits two events (the token going in and the token coming out)",
  },
};

export default adapter;