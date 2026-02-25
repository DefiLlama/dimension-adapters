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

  for (const log of logs) {
    const token = (log.tokenAddress as string)?.toLowerCase();
    if (!token) continue;
    const amount = log.isBuy ? log.fromAmount : log.toAmount;
    dailyVolume.add(token, amount);
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
      "Calculates swap volume from the TokenExchanged event emitted by the EGAS Swap proxy. " +
      "The ERC20 asset side of each swap is counted as volume.",
  },
};

export default adapter;