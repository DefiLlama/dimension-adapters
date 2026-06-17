import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// HookOS bonding-curve contracts per chain, synced from the canonical deployment
// registry (contracts/deployments/addresses.json) and verified on each chain's
// explorer. Volume is bonding-curve swap volume only: arena wagers, copy-trade
// records and token-launch fees are not trading volume and are excluded.
// Post-graduation trading moves to Uniswap v4 and is counted by Uniswap's own
// adapter, so it is excluded here to avoid double-counting.
const BONDING_CURVE: Record<string, string> = {
  [CHAIN.BASE]:        "0x3C4b0F2D3d5bBdf4E0B323f0a8Eec7B02Cce6d40",
  [CHAIN.MEGAETH]:     "0x6A2fAa5Da2B9F1515661f18160C0A0d584c0AC15",
  [CHAIN.HYPERLIQUID]: "0x93f35a190E6B7ed05E7bBAb78199720C0c849dDE",
};

// Verified against the deployed BondingCurve.sol source.
const tokenBoughtAbi = "event TokenBought(address indexed token, address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 newPrice)";
const tokenSoldAbi = "event TokenSold(address indexed token, address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 newPrice)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances, chain } = options;
  const target = BONDING_CURVE[chain];
  const dailyVolume = createBalances();

  // ETH in/out of every bonding-curve buy and sell.
  const [buyLogs, sellLogs] = await Promise.all([
    getLogs({ target, eventAbi: tokenBoughtAbi }),
    getLogs({ target, eventAbi: tokenSoldAbi }),
  ]);
  for (const log of buyLogs) dailyVolume.addGasToken(log.ethIn);
  for (const log of sellLogs) dailyVolume.addGasToken(log.ethOut);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [
    [CHAIN.BASE, { start: '2026-06-05' }],
    [CHAIN.MEGAETH, { start: '2026-06-14' }],
    [CHAIN.HYPERLIQUID, { start: '2026-06-07' }],
  ],
  methodology: {
    Volume: "Bonding-curve swap volume: ETH paid into buys (TokenBought) and ETH received from sells (TokenSold) on the HookOS BondingCurve. Post-graduation Uniswap v4 trading is excluded (counted by Uniswap), as are arena wagers, copy-trade records and launch fees.",
  },
  pullHourly: true,
};

export default adapter;
