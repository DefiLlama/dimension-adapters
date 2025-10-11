import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const ROUTER_ADDRESS = "0x9c0F3c0C20D10297cA4bFB50846f3242Ea2B9787";

const SharesBoughtEvent =
  "event SharesBoughtViaRouter(address indexed buyer, address indexed market, uint8 outcomeIndex, uint256 tokenAmount, uint256 shares)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const buyLogs: any[] = await options.getLogs({
    target: ROUTER_ADDRESS,
    eventAbi: SharesBoughtEvent,
  });

  buyLogs.forEach((log: any) => {
    dailyVolume.add(ADDRESSES.bsc.USDT, log.tokenAmount);
  });

  return {
    dailyVolume,
  };
};

const methodology = {
  Volume: "All trades on prediction markets.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: "2025-10-08",
  methodology,
};

export default adapter;
