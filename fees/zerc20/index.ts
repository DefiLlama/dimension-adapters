import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// zERC20 — private ERC-20 transfers via zk proof-of-burn.
// Addresses: github.com/kbizikav/zERC20/tree/main/config/deployed/mainnet (zJPYC LiquidityManager located on-chain).
const zETH = "0x410056c6F0A9ABD8c42b9eEF3BB451966Fb0d924";
const zUSDC = "0xEB81ab55Bc7aa89d1e0E3F60597D86e37702Af53";
const zBNB = "0x4388D5618B9e13Bd580209CDf37a202778C75c54";
const zJPYC = "0xd33Bed4Ae7Fe50107c532f63740B1bF2dabf2b30";
const JPYC = "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29";
const zETH_LM = "0xcC10b7098FEf1aB2f0FF3bE91d2A7B3230b90CF0";
const zUSDC_LM = "0x04be137Df79bE7B5F3314C4a84D1C5E0d99BD477";
const zJPYC_LM = "0x12609C3a7A1A212953417c90472cDCF034965A1c";

// Redeem fee: 0.35% of the gross private-transfer amount, withheld before the Verifier mints,
// so minted amounts (recipient + relayer legs) are gross * (1 - 0.35%).
// Source: zerc20.gitbook.io/zerc20/for-users/fees-and-rewards
const REDEEM_FEE_BPS = 35n;
const BPS_DENOMINATOR = 10_000n; // basis points in 100%
// First fee-bearing redeems on every chain were on 2026-06-02 00:00 UTC; nothing was withheld before.
const REDEEM_FEE_LIVE = 1780358400;
const BNB_UNIT = 1e18; // zBNB and BNB both have 18 decimals

const TELEPORT_EVENT = "event Teleport(address indexed to, uint256 value)";
const UNWRAPPED_EVENT = "event Unwrapped(address indexed caller, address indexed receiver, uint256 amountOut, uint256 feeAmount)";

const REDEEM_FEE = "Redeem Fees";
const UNWRAP_FEE = "Unwrap Fees";

type Asset = { token: string; liquidityManager?: string; add: (balances: any, amount: bigint, label: string) => void };

const gas = (balances: any, amount: bigint, label: string) => balances.addGasToken(amount, label);
const erc20 = (token: string) => (balances: any, amount: bigint, label: string) => balances.add(token, amount, label);
const bnb = (balances: any, amount: bigint, label: string) => balances.addCGToken("binancecoin", Number(amount) / BNB_UNIT, label);

const evmAssets = (usdc: string): Asset[] => [
  { token: zETH, liquidityManager: zETH_LM, add: gas },
  { token: zUSDC, liquidityManager: zUSDC_LM, add: erc20(usdc) },
  { token: zBNB, add: bnb }, // zBNB wraps only on BNB Chain; elsewhere it is transferable but has no LiquidityManager
];

const chainConfig: Record<string, { start: string; assets: Asset[] }> = {
  [CHAIN.ETHEREUM]: { start: "2026-02-02", assets: evmAssets(ADDRESSES.ethereum.USDC) },
  [CHAIN.ARBITRUM]: { start: "2026-02-02", assets: evmAssets(ADDRESSES.arbitrum.USDC_CIRCLE) },
  [CHAIN.BASE]: { start: "2026-02-02", assets: evmAssets(ADDRESSES.base.USDC) },
  // zBNB wrap/unwrap is fee-exempt, so its LiquidityManager has no unwrap fees to read
  [CHAIN.BSC]: { start: "2026-02-02", assets: [{ token: zBNB, add: gas }] },
  [CHAIN.POLYGON]: { start: "2026-06-08", assets: [{ token: zJPYC, liquidityManager: zJPYC_LM, add: erc20(JPYC) }] },
  [CHAIN.KLAYTN]: { start: "2026-06-29", assets: [{ token: zJPYC, liquidityManager: zJPYC_LM, add: erc20(JPYC) }] },
};

/**
 * Redeem fees are derived from zERC20 Teleport mints, since the fee is withheld before minting and not emitted.
 * Unwrap fees are read directly from LiquidityManager Unwrapped events.
 */
async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const { assets } = chainConfig[options.chain];

  if (options.startTimestamp >= REDEEM_FEE_LIVE) {
    const teleports = await options.getLogs({ targets: assets.map((a) => a.token), eventAbi: TELEPORT_EVENT, flatten: false });
    teleports.forEach((logs: any[], i: number) => {
      const minted = logs.reduce((sum, log) => sum + BigInt(log.value), 0n);
      if (minted > 0n) assets[i].add(dailyFees, (minted * REDEEM_FEE_BPS) / (BPS_DENOMINATOR - REDEEM_FEE_BPS), REDEEM_FEE);
    });
  }

  const lmAssets = assets.filter((a) => a.liquidityManager);
  if (lmAssets.length) {
    const unwraps = await options.getLogs({ targets: lmAssets.map((a) => a.liquidityManager!), eventAbi: UNWRAPPED_EVENT, flatten: false });
    unwraps.forEach((logs: any[], i: number) => {
      const fees = logs.reduce((sum, log) => sum + BigInt(log.feeAmount), 0n);
      if (fees > 0n) lmAssets[i].add(dailyFees, fees, UNWRAP_FEE);
    });
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const methodology = {
  Fees: "0.35% redeem fee on private transfers (withheld from the gross amount before zAssets are minted to the recipient, live since 2026-06-02) plus liquidity-based unwrap fees charged by the LiquidityManagers.",
  Revenue: "All fees are retained by the protocol: the redeem fee is never minted, and unwrap fees accrue to the LiquidityManager fee surplus.",
  ProtocolRevenue: "All fees are retained by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [REDEEM_FEE]: "0.35% of the gross private-transfer amount, derived from Teleport mints as minted * 0.35 / 99.65.",
    [UNWRAP_FEE]: "feeAmount from LiquidityManager Unwrapped events; the rate rises as liquidity falls below target (zBNB is exempt).",
  },
  Revenue: {
    [REDEEM_FEE]: "Redeem fee withheld by the protocol.",
    [UNWRAP_FEE]: "Unwrap fees added to the LiquidityManager fee surplus.",
  },
  ProtocolRevenue: {
    [REDEEM_FEE]: "Redeem fee withheld by the protocol.",
    [UNWRAP_FEE]: "Unwrap fees added to the LiquidityManager fee surplus.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
