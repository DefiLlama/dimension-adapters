import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  fetchOriginFees,
  OriginProduct,
  ORIGIN_YIELD_LABEL,
  ORIGIN_PROTOCOL_FEE_LABEL,
  ORIGIN_REBASE_LABEL,
  STAKING_REWARDS_LABEL,
} from "../helpers/origin-protocol";

// ARM vaults expose fee() (uint16) instead of trusteeFeeBps() but use the same
// 1e4 basis-point scale (AbstractARM.sol: FEE_SCALE = 10000, line 887:
// fees = assetIncrease × fee / FEE_SCALE). All six currently set to 2000 (20%).
//
// `start` (YYYY-MM-DD) gates products deployed after the chain's adapter start:
// fee() is read at the day's end block, so it must not be called before the
// vault exists. The multi-asset WETH ARM and USDC ARM were deployed on
// 2026-07-22 (blocks 25588387 and 25588390).
type ArmProduct = OriginProduct & { start?: string };

const PRODUCTS_BY_CHAIN: Record<string, ArmProduct[]> = {
  [CHAIN.ETHEREUM]: [
    { apiKey: "armWethSteth", vault: "0x85b78aca6deae198fbf201c82daf6ca21942acc6", feeAbi: "uint16:fee" },
    { apiKey: "armWethEeth",  vault: "0xfb0a3cf9b019bfd8827443d131b235b3e0fc58d2", feeAbi: "uint16:fee" },
    { apiKey: "armSusdeUsde", vault: "0xCEDa2d856238aA0D12f6329de20B9115f07C366d", feeAbi: "uint16:fee" },
    // Multi-asset WETH ARM (bases: stETH / wstETH / eETH / weETH)
    { apiKey: "armWeth",      vault: "0x68025A4615407993A680102b08a23A61D11C657C", feeAbi: "uint16:fee", start: "2026-07-22" },
    // Multi-asset USDC ARM (bases: PYUSD / USDG)
    { apiKey: "armUsdc",      vault: "0x9E3A7026E5767F2d7Ff5e83b0ed011005f45a170", feeAbi: "uint16:fee", start: "2026-07-22" },
  ],
  [CHAIN.SONIC]: [
    { apiKey: "armWsOs", vault: "0x2f872623d1e1af5835b08b0e49aad2d81d649d30", feeAbi: "uint16:fee" },
  ],
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const products = (PRODUCTS_BY_CHAIN[options.chain] ?? [])
    .filter((p) => !p.start || options.dateString >= p.start);
  return fetchOriginFees(products)(options);
};

const methodology = {
  Fees: "Profit earned by Origin ARM vaults from spread captured between LP redemptions and the underlying asset price (Lido stETH ARM, Ether.fi eETH ARM, Ethena sUSDe/USDe ARM, multi-asset WETH ARM, USDC ARM, Sonic wS/OS ARM).",
  Revenue: "Per-ARM profit × fee read on-chain from each vault (all currently 20%).",
  HoldersRevenue: "Performance fee distributed to OGN stakers.",
  SupplySideRevenue: "Profit (net of performance fee) received by ARM vault depositors.",
};

const breakdownMethodology = {
  Fees: {
    [ORIGIN_YIELD_LABEL]: "Daily ARM-vault profit (Lido stETH, Ether.fi eETH, Ethena sUSDe/USDe, multi-asset WETH, USDC, Sonic wS/OS) as published by Origin's daily_revenue API, before performance fee.",
  },
  Revenue: {
    [ORIGIN_PROTOCOL_FEE_LABEL]: "Per-vault profit × on-chain fee() from each AbstractARM vault.",
  },
  HoldersRevenue: {
    [STAKING_REWARDS_LABEL]: "Performance fee forwarded to OGN stakers.",
  },
  SupplySideRevenue: {
    [ORIGIN_REBASE_LABEL]: "Profit net of performance fee, distributed to ARM vault depositors.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  // ARM vaults can show negative amountUSD on loss days (NAV dipping before
  // the next rebase). The helper forwards those through instead of dropping
  // them so dailyFees / Revenue / SupplySide reflect the true daily delta.
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-10-24' },
    [CHAIN.SONIC]: { fetch, start: '2025-02-07' },
  },
};

export default adapter;
