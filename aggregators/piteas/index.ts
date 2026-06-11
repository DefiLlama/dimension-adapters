import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { formatAddress } from "../../utils/utils";

const PITEAS_ROUTER = "0x6BF228eb7F8ad948d37deD07E595EfddfaAF88A6";
const WPLS = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const SWAP_EVENT =
  "event SwapEvent(address swapManager, address srcToken, address destToken, address indexed sender, address destReceiver, uint256 srcAmount, uint256 destAmount)";

const normalizeToken = (token: string): string => {
  const address = formatAddress(token);
  if (
    address === "0x0000000000000000000000000000000000000000" ||
    address === formatAddress(NATIVE_TOKEN)
  ) {
    return WPLS;
  }
  return address;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    target: PITEAS_ROUTER,
    eventAbi: SWAP_EVENT,
  });

  logs.forEach((log: any) => {
    dailyVolume.add(normalizeToken(log.destToken), log.destAmount);
  });

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Swap volume routed through PiteasRouter on PulseChain. Measured as the output token amount (destAmount) emitted in each SwapEvent.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.PULSECHAIN]: {
      start: "2023-07-07",
    },
  },
  methodology,
};

export default adapter;
