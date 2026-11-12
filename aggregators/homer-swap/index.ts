// Homer Swap: the best-rate router of Homer, the liquidity layer of Elysium (https://homer.finance).
// It quotes every pool on Elysium (Uniswap v2/v3/v4-style venues: KleosSwap, ElysPump, BOXA,
// Uniswap v4, launchpad pools...) and routes each trade through the best one. Every trade has
// HYPE on one side; its Swapped event gives that HYPE amount, which is the trade's volume.
// Contracts are verified on Kinetiq's explorer: https://elysium.kinetiq.xyz
// Address source: the current contracts are in Homer's contract list (https://homer.finance/docs,
// Contracts section; JSON at https://homer.finance/api/contracts). The others are the earlier versions
// they replaced, deployed by the same owner (0x206e52b4b2ef813a1b34793091c9b87761e775f4); each one
// can be checked at https://elysium.kinetiq.xyz/address/<address>.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Every Homer Swap version (trades still settle through each one it was deployed with).
const HOMER_SWAPS = [
  "0xcdef14ba5177ec3700067a70ca1f21c9d3415489",
  "0x1cae4a793ce7b8ed136d1143ed31e402f9b53873",
  "0xa9967eaba36531526a1458aed9b16453adcfb7e9",
];

const SWAPPED = "event Swapped(address indexed user, address indexed target, address indexed token, bool buy, uint256 hypeAmount, uint256 tokenAmount, uint256 fee)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const swaps = await options.getLogs({ targets: HOMER_SWAPS, eventAbi: SWAPPED });
  for (const l of swaps) dailyVolume.addGasToken(l.hypeAmount);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-10-30",
  methodology: {
    Volume: "The HYPE side of every trade routed through Homer Swap, from its Swapped events.",
  },
};

export default adapter;
