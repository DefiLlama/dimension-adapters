import { Adapter, FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// HookOS trading volume, from the two venues HookOS runs itself:
//
//   • BondingCurve — pre-graduation trading, denominated in the native gas token.
//   • HookPool     — the in-house AMM and the graduation target on HyperEVM.
//                    Enumerated from PoolFactory. No other adapter reports it.
//
// Uniswap v3/v4 trading is excluded — Uniswap's own adapters count it. That
// includes the $HOOK v4 pool on Robinhood: it is HookOS's own token behind a
// HookOS tax hook, but the venue is Uniswap and dexs/uniswap-v4.ts already
// covers that PoolManager from logs, so counting it here would double it at the
// aggregate. The tax the hook skims is a different matter — it is HookOS
// revenue no Uniswap adapter sees, and fees/hookos.ts reports it.
//
// Arena wagers, copy-trade records and launch fees are not trading volume and
// are excluded too. Addresses are the canonical deployment registry
// (protocol/contracts/deployments/addresses.json).
type ChainConfig = {
  BondingCurve: string;
  PoolFactory: string;
  start: string;
};

const CONFIG: Record<string, ChainConfig> = {
  [CHAIN.BASE]: {
    BondingCurve: "0x3C4b0F2D3d5bBdf4E0B323f0a8Eec7B02Cce6d40",
    PoolFactory:  "0xEE71e51e757a3B36F027400CDb7182710564654A",
    start: "2026-06-05",
  },
  [CHAIN.HYPERLIQUID]: {
    BondingCurve: "0x93f35a190E6B7ed05E7bBAb78199720C0c849dDE",
    PoolFactory:  "0xF2F1C1D5089995c55C9Bf0395ebb70EBBF17b61D",
    start: "2026-06-07",
  },
  [CHAIN.MEGAETH]: {
    BondingCurve: "0x6A2fAa5Da2B9F1515661f18160C0A0d584c0AC15",
    PoolFactory:  "0x1106A0257bbB2f7950f5bcf366e966D24c6F5cDd",
    start: "2026-06-14",
  },
  [CHAIN.BSC]: {
    BondingCurve: "0xbb141A22B4cAef996052b2ecC9F9ef2Cde259bcA",
    PoolFactory:  "0x0d04627b6eFc9f546702969fF1faBD7a9642886f",
    start: "2026-06-17",
  },
  [CHAIN.ETHEREUM]: {
    BondingCurve: "0xc841eF17b424B00A46C5acebDEEbE2976F168AC7",
    PoolFactory:  "0xcDfD3B997EC5A2F9CA59955d9aCE30eD8dFbFEff",
    start: "2026-06-18",
  },
  [CHAIN.ROBINHOOD]: {
    BondingCurve: "0x93f35a190E6B7ed05E7bBAb78199720C0c849dDE",
    PoolFactory:  "0xF2F1C1D5089995c55C9Bf0395ebb70EBBF17b61D",
    start: "2026-07-02",
  },
};

// Verified against the deployed contract source.
const tokenBoughtAbi = "event TokenBought(address indexed token, address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 newPrice)";
const tokenSoldAbi = "event TokenSold(address indexed token, address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 newPrice)";
const hookPoolSwapAbi = "event Swap(address indexed sender, uint256 amountIn, uint256 amountOut, address indexed tokenIn, address indexed to)";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, createBalances, api, chain } = options;
  const c = CONFIG[chain];
  const dailyVolume = createBalances();

  // Bonding-curve trading: native gas token in on every buy, out on every sell.
  if (c.BondingCurve) {
    const [buyLogs, sellLogs] = await Promise.all([
      getLogs({ target: c.BondingCurve, eventAbi: tokenBoughtAbi }),
      getLogs({ target: c.BondingCurve, eventAbi: tokenSoldAbi }),
    ]);
    for (const log of buyLogs) dailyVolume.addGasToken(log.ethIn);
    for (const log of sellLogs) dailyVolume.addGasToken(log.ethOut);
  }

  // HookPool swaps, counted on the input leg only so each swap is counted once.
  // A pool's input token may be a launched token DeFiLlama cannot price, which
  // contributes zero rather than a fabricated value.
  if (c.PoolFactory) {
    const count = await api.call({ target: c.PoolFactory, abi: 'uint256:getPoolCount' });
    if (count > 0) {
      const pools: string[] = await api.multiCall({
        abi: 'function allPools(uint256) view returns (address)',
        calls: [...Array(count).keys()].map((i) => ({ target: c.PoolFactory!, params: [i] })),
        permitFailure: true,
      }).then((r: any[]) => r.filter(Boolean));
      if (pools.length) {
        const swapLogs = await getLogs({ targets: pools, eventAbi: hookPoolSwapAbi, flatten: true });
        for (const log of swapLogs) dailyVolume.add(log.tokenIn, log.amountIn);
      }
    }
  }

  return { dailyVolume };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: CONFIG,
  methodology: {
    Volume: "Trading on the venues HookOS runs itself: bonding-curve buys and sells (native gas token in and out) and swaps through HookPool — the in-house AMM and the graduation target on HyperEVM, counted on the input leg. Uniswap trading is excluded and counted by Uniswap's own adapters: that covers post-graduation pools and the $HOOK v4 pool on Robinhood, which trades on a Uniswap PoolManager that Uniswap's v4 adapter already reports. Arena wagers, copy-trade records and launch fees are not trading volume and are excluded.",
  },
  pullHourly: true,
};

export default adapter;
