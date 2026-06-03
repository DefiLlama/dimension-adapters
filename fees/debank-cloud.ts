import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { addTokensReceived } from "../helpers/token";

const methodology = {
  Fees: "USDC/USDT deposits paid by users to top up DeBank Cloud / DeBank credit, plus swap fees collected by DeBank. Note: this does not include payments made by card/fiat, which DeBank also supports but are settled off-chain.",
  Revenue: "All on-chain deposits and swap fees collected by DeBank. Card/fiat payments are not included as they are settled off-chain.",
  ProtocolRevenue: "All on-chain deposits and swap fees collected by DeBank. Card/fiat payments are not included as they are settled off-chain.",
};

// DeBank migrated payments from the old single receiving wallet to per-chain
// deposit vaults (Gnosis Safes, labelled "Debank: Deposit Vault" on the explorers
// and "Bridge Deposit"/"Gnosis Safe Proxy" by Arkham), which now accept USDC + USDT.
// The old wallet is kept tracked to still capture any tail payments for
// legacy plans/credits.
const OLD_WALLET = "0x3c6923D09ec77648ca923fFB4e50251120756faa";

// "debank: swap_fees" wallet - collects swap fees in arbitrary tokens, on every
// chain DeBank Swap operates on (same address across chains).
const SWAP_FEES = "0x349A27b247016B4cce4f5ab7B89689F6ED9958f5";

const config: Record<string, { depositTargets: string[]; stables: string[] }> = {
  [CHAIN.ETHEREUM]: {
    // new "Debank: Deposit Vault" + legacy wallet
    depositTargets: ["0x205e94337bc61657b4b698046c3c2c5c1d2fb8f1", OLD_WALLET],
    stables: [ADDRESSES.ethereum.USDC, ADDRESSES.ethereum.USDT],
  },
  [CHAIN.POLYGON]: {
    depositTargets: ["0xdE74F4eFDeec194c3f7b26bE736BC8B5266FF7A5", OLD_WALLET],
    stables: [ADDRESSES.polygon.USDC_CIRCLE, ADDRESSES.polygon.USDT],
  },
  [CHAIN.BSC]: {
    depositTargets: ["0x293391044c6981b6417fa0dcfd85524d4098a8d6"],
    stables: [ADDRESSES.bsc.USDC, ADDRESSES.bsc.USDT],
  },
  [CHAIN.BASE]: {
    // no dedicated vault on Base; keep legacy wallet for tail payments
    depositTargets: [OLD_WALLET],
    stables: [ADDRESSES.base.USDC, ADDRESSES.base.USDT],
  },
  [CHAIN.ARBITRUM]: {
    // "Debank: Gnosis Safe Proxy (0x40F)" deposit vault (per Arkham)
    depositTargets: ["0x40F480F247f3aD2fF4c1463E84f03Be3A9a03E15"],
    stables: [ADDRESSES.arbitrum.USDC_CIRCLE, ADDRESSES.arbitrum.USDC, ADDRESSES.arbitrum.USDT],
  },
};

const fetch = async (options: FetchOptions) => {
  const { depositTargets, stables } = config[options.chain];
  const dailyFees = options.createBalances();

  // user deposits / top-ups (USDC + USDT)
  if (depositTargets.length)
    await addTokensReceived({ options, balances: dailyFees, tokens: stables, targets: depositTargets });

  // swap fees, collected in arbitrary tokens (no token filter -> capture all)
  await addTokensReceived({ options, balances: dailyFees, target: SWAP_FEES });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  methodology,
  version: 2,
  adapter: Object.fromEntries(
    Object.keys(config).map((chain) => [chain, { fetch }])
  ),
};

export default adapter;
