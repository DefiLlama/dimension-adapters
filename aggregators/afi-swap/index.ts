import { Chain } from "../../adapters/types";
import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// AfiReferralRouter.ReferralSwap — emitted once per swap routed through the router.
// Volume is measured by the input side (tokenIn / amountIn).
const abi =
  "event ReferralSwap(address indexed user, address indexed tokenIn, uint256 amountIn, address indexed tokenOut, uint256 userAmount, address referrer, uint256 fee, address executor)";

type IContract = {
  [c: string | Chain]: string;
};

const contract: IContract = {
  [CHAIN.ETHEREUM]: "0x47E7cE4237130F02202e081Efa1Fd338F23Ead77",
  [CHAIN.BASE]: "0x2dC7a3990618baa91c450521004F14A334BF47c6",
  [CHAIN.ARBITRUM]: "0x9DaD9322e196F734Fa25eC3b0db90387945B397C",
  [CHAIN.BSC]: "0x7356960324a627994bb5959CF615DC5f2B38B738",
  [CHAIN.UNICHAIN]: "0xcdC506dEA82FE7d034C0281564d0dbe49171D242",
};

const fetch: FetchV2 = async ({ getLogs, createBalances, chain }) => {
  const dailyVolume = createBalances();
  const logs = await getLogs({ target: contract[chain], eventAbi: abi });

  logs.forEach((log: any) => dailyVolume.add(log.tokenIn, log.amountIn));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: Object.keys(contract),
  start: "2026-05-30",
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "Total USD value of the input tokens (tokenIn/amountIn) of swaps routed through the AfiReferralRouter (swapWithReferral), summed from ReferralSwap events on each chain.",
  },
};

export default adapter;
