import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Canonical NARA Protocol V5 & CryptoSLIP Base Mainnet (Chain ID 8453) contracts
// Official registry & verification: https://naraprotocol.io
const NARA_TOKEN = "0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f"; // https://basescan.org/token/0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f
const BASE_USDC = ADDRESSES.base.USDC;
const ETH_ZERO = ADDRESSES.null;

// NARAFeeVaultV5 (active + initial Nov 2 deployment for complete historical log coverage)
const ACTIVE_NARA_FEE_VAULT_V5 = "0xF1f361F803895BF5cf67eC6C506dbFEf2f6E88Cf"; // https://basescan.org/address/0xF1f361F803895BF5cf67eC6C506dbFEf2f6E88Cf
const INITIAL_NARA_FEE_VAULT_V5 = "0xe63b4BaAF873FC57859bfe13e0e8cFccAaB6AddE"; // https://basescan.org/address/0xe63b4BaAF873FC57859bfe13e0e8cFccAaB6AddE

// NARAPositionSaleV5 (5.00% / 500 bps secondary position sale fee in native ETH)
const ACTIVE_NARA_POSITION_SALE_V5 = "0x04Ac83045d26259D46400Ce6beb9bBd0641df225"; // https://basescan.org/address/0x04Ac83045d26259D46400Ce6beb9bBd0641df225
const INITIAL_NARA_POSITION_SALE_V5 = "0xef99081Ce6B150A0BaF109822C12D96EE4eC3fb4"; // https://basescan.org/address/0xef99081Ce6B150A0BaF109822C12D96EE4eC3fb4

// NARARewardIngressV5 (EIP-2981 external NFT marketplace royalties routed to committed NARA holders)
const NARA_REWARD_INGRESS_V5 = "0x44130CC47b886D8488041F5eaE271477D1aFA909"; // https://basescan.org/address/0x44130CC47b886D8488041F5eaE271477D1aFA909

// CryptoSlip vaults (0.50% / 50 bps slip issuance & re-transfer fee; 50/50 referral split on V32/V33)
const CRYPTOSLIP_VAULT_V33 = "0x3f80aa68Fb4834d6E119EE1cf932C14419Cf63EB"; // https://basescan.org/address/0x3f80aa68Fb4834d6E119EE1cf932C14419Cf63EB
const CRYPTOSLIP_VAULT_V32 = "0x38BF0321FA7489576978353a6a8da4A3e85C2F18"; // https://basescan.org/address/0x38BF0321FA7489576978353a6a8da4A3e85C2F18
const CRYPTOSLIP_VAULT_V3 = "0x4Dc2b5A801A81b17b8d05C737c727FEd1f30699A"; // https://basescan.org/address/0x4Dc2b5A801A81b17b8d05C737c727FEd1f30699A
const CRYPTOSLIP_VAULT_V2 = "0x87aadDF2d3aa11Cddf36939715508066a99BA415"; // https://basescan.org/address/0x87aadDF2d3aa11Cddf36939715508066a99BA415

const INTERNAL_INGRESS_SENDERS = new Set([
  ACTIVE_NARA_POSITION_SALE_V5.toLowerCase(),
  INITIAL_NARA_POSITION_SALE_V5.toLowerCase(),
  ACTIVE_NARA_FEE_VAULT_V5.toLowerCase(),
  INITIAL_NARA_FEE_VAULT_V5.toLowerCase(),
]);

const LABELS = {
  HOOK_SWAP_FEES: "Hook Swap Fees",
  POL_LP_FEES: "POL LP Fees",
  POSITION_SALE_FEES: "Position Sale Fees",
  EXTERNAL_ROYALTY_FEES: "External Position Royalties",
  SLIP_ISSUANCE_FEES: "Slip Issuance Fees",
  HOOK_FEES_TO_PROTOCOL: "Hook Swap Fees To Protocol",
  POL_LP_FEES_TO_PROTOCOL: "POL LP Fees To Protocol",
  POSITION_SALE_FEES_TO_HOLDERS: "Position Sale Fees To Holders",
  EXTERNAL_ROYALTIES_TO_HOLDERS: "External Position Royalties To Holders",
  SLIP_FEES_TO_TREASURY: "Slip Issuance Fees To Treasury",
  SLIP_REFERRAL_FEES: "Slip Referral Fees",
  COMMITTED_POSITION_DISTRIBUTIONS: "Committed Position Distributions",
} as const;

// RewardAsset enum in NARA V5: 0 = NARA, 1 = ETH, 2 = USDC
function assetAddress(assetEnum: number): string {
  if (Number(assetEnum) === 0) return NARA_TOKEN;
  if (Number(assetEnum) === 1) return ETH_ZERO;
  return BASE_USDC;
}

const FEE_RECORDED_EVENT =
  "event FeeRecorded(uint8 indexed asset, bool indexed lpFee, uint256 amount, uint256 holders, uint256 pol)";
const POSITION_PURCHASED_EVENT =
  "event Purchased(uint256 indexed listingId, uint256 indexed tokenId, address indexed buyer, address seller, uint256 price, uint256 fee)";
const INGRESS_NATIVE_RECEIVED_EVENT =
  "event NativeReceived(address indexed sender, uint256 amount)";
const SLIP_FEE_ACCRUED_V32_EVENT =
  "event FeeAccrued(address indexed asset, uint256 protocolFee, address indexed referrer, uint256 referralFee)";
const SLIP_FEE_ACCRUED_LEGACY_EVENT =
  "event FeeAccrued(address indexed asset, uint256 feeAmount)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // 1. Uniswap v4 NARALiquidityHookV5 swap fees + POL LP fees booked into NARAFeeVaultV5
  const feeLogs = await options.getLogs({
    targets: [ACTIVE_NARA_FEE_VAULT_V5, INITIAL_NARA_FEE_VAULT_V5],
    eventAbi: FEE_RECORDED_EVENT,
  });

  for (const log of feeLogs) {
    const token = assetAddress(Number(log.asset));
    const isLpFee = Boolean(log.lpFee);
    const feeLabel = isLpFee ? LABELS.POL_LP_FEES : LABELS.HOOK_SWAP_FEES;
    const revLabel = isLpFee ? LABELS.POL_LP_FEES_TO_PROTOCOL : LABELS.HOOK_FEES_TO_PROTOCOL;

    dailyFees.add(token, log.amount, feeLabel);
    if (!isLpFee) {
      dailyUserFees.add(token, log.amount, LABELS.HOOK_SWAP_FEES);
    }
    dailyRevenue.add(token, log.amount, revLabel);
    dailyProtocolRevenue.add(token, log.pol, revLabel);
    dailyHoldersRevenue.add(token, log.holders, LABELS.COMMITTED_POSITION_DISTRIBUTIONS);
  }

  // 2. NARAPositionSaleV5 secondary position marketplace fees (5.00% in native ETH routed to committed NARA holders)
  const saleLogs = await options.getLogs({
    targets: [ACTIVE_NARA_POSITION_SALE_V5, INITIAL_NARA_POSITION_SALE_V5],
    eventAbi: POSITION_PURCHASED_EVENT,
  });

  for (const log of saleLogs) {
    dailyFees.add(ETH_ZERO, log.fee, LABELS.POSITION_SALE_FEES);
    dailyUserFees.add(ETH_ZERO, log.fee, LABELS.POSITION_SALE_FEES);
    dailyRevenue.add(ETH_ZERO, log.fee, LABELS.POSITION_SALE_FEES_TO_HOLDERS);
    dailyHoldersRevenue.add(ETH_ZERO, log.fee, LABELS.COMMITTED_POSITION_DISTRIBUTIONS);
  }

  // 3. External EIP-2981 NFT marketplace royalties received by NARARewardIngressV5 (excluding internal PositionSale/FeeVault pushes)
  const ingressLogs = await options.getLogs({
    target: NARA_REWARD_INGRESS_V5,
    eventAbi: INGRESS_NATIVE_RECEIVED_EVENT,
  });

  for (const log of ingressLogs) {
    if (INTERNAL_INGRESS_SENDERS.has(String(log.sender).toLowerCase())) continue;
    dailyFees.add(ETH_ZERO, log.amount, LABELS.EXTERNAL_ROYALTY_FEES);
    dailyUserFees.add(ETH_ZERO, log.amount, LABELS.EXTERNAL_ROYALTY_FEES);
    dailyRevenue.add(ETH_ZERO, log.amount, LABELS.EXTERNAL_ROYALTIES_TO_HOLDERS);
    dailyHoldersRevenue.add(ETH_ZERO, log.amount, LABELS.COMMITTED_POSITION_DISTRIBUTIONS);
  }

  // 4. CryptoSlipVaultV32/V33 bearer slip issuance & re-transfer fees (0.50% gross; up to 50% referral share)
  const slipLogs = await options.getLogs({
    targets: [CRYPTOSLIP_VAULT_V33, CRYPTOSLIP_VAULT_V32],
    eventAbi: SLIP_FEE_ACCRUED_V32_EVENT,
  });

  for (const log of slipLogs) {
    const token = log.asset.toLowerCase() === ETH_ZERO ? ETH_ZERO : log.asset;
    const totalFee = BigInt(log.protocolFee) + BigInt(log.referralFee);

    dailyFees.add(token, totalFee, LABELS.SLIP_ISSUANCE_FEES);
    dailyUserFees.add(token, totalFee, LABELS.SLIP_ISSUANCE_FEES);
    dailySupplySideRevenue.add(token, log.referralFee, LABELS.SLIP_REFERRAL_FEES);
    dailyRevenue.add(token, log.protocolFee, LABELS.SLIP_FEES_TO_TREASURY);
    dailyProtocolRevenue.add(token, log.protocolFee, LABELS.SLIP_FEES_TO_TREASURY);
  }

  // 5. Legacy CryptoSlipVaultV3/V2 issuance fees (100% treasury share)
  const legacySlipLogs = await options.getLogs({
    targets: [CRYPTOSLIP_VAULT_V3, CRYPTOSLIP_VAULT_V2],
    eventAbi: SLIP_FEE_ACCRUED_LEGACY_EVENT,
  });

  for (const log of legacySlipLogs) {
    const token = log.asset.toLowerCase() === ETH_ZERO ? ETH_ZERO : log.asset;
    dailyFees.add(token, log.feeAmount, LABELS.SLIP_ISSUANCE_FEES);
    dailyUserFees.add(token, log.feeAmount, LABELS.SLIP_ISSUANCE_FEES);
    dailyRevenue.add(token, log.feeAmount, LABELS.SLIP_FEES_TO_TREASURY);
    dailyProtocolRevenue.add(token, log.feeAmount, LABELS.SLIP_FEES_TO_TREASURY);
  }

  return {
    dailyFees,
    dailyUserFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Swap fees realized by NARALiquidityHookV5, Protocol-Owned Liquidity (POL) LP fees booked into NARAFeeVaultV5, 5.00% secondary position sale fees on NARAPositionSaleV5, external EIP-2981 royalties received by NARARewardIngressV5, and 0.50% slip issuance fees on CryptoSLIP vaults. Zero management or performance fees are charged.",
  UserFees: "Dynamic swap fees paid on the Uniswap v4 NARA/USDC hooked pool, 5.00% secondary position sale fees on NARAPositionSaleV5, external EIP-2981 position royalties, and 0.50% slip issuance and re-transfer fees on CryptoSLIP vaults (no management or performance fees).",
  SupplySideRevenue: "50% referral fee share paid on referred CryptoSlipVaultV32 slip issuances.",
  Revenue: "Net protocol fees retained across NARAFeeVaultV5 (POL + committed holder share), NARAPositionSaleV5 and NARARewardIngressV5 (committed holder share), and CryptoSLIP treasury share.",
  ProtocolRevenue: "Share of NARAFeeVaultV5 Hook and LP fees allocated to Protocol-Owned Liquidity (POL) plus the CryptoSLIP treasury fee share.",
  HoldersRevenue: "Share of NARAFeeVaultV5 Hook and LP fees plus 5.00% NARAPositionSaleV5 secondary sale fees and external EIP-2981 royalties distributed to committed NARA position holders via NARARewardLedgerV5.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.HOOK_SWAP_FEES]: "Dynamic swap fees captured by NARALiquidityHookV5 on the Uniswap v4 NARA/USDC pool.",
    [LABELS.POL_LP_FEES]: "LP fees collected from Protocol-Owned Liquidity positions into NARAFeeVaultV5.",
    [LABELS.POSITION_SALE_FEES]: "5.00% native ETH fee charged on secondary NARA Position NFT sales via NARAPositionSaleV5.",
    [LABELS.EXTERNAL_ROYALTY_FEES]: "External EIP-2981 NFT marketplace royalties received in native ETH by NARARewardIngressV5.",
    [LABELS.SLIP_ISSUANCE_FEES]: "0.50% gross fee charged when sealing or re-transferring bearer slips on CryptoSLIP vaults.",
  },
  UserFees: {
    [LABELS.HOOK_SWAP_FEES]: "Dynamic swap fees paid by traders on the Uniswap v4 NARA/USDC hooked pool.",
    [LABELS.POSITION_SALE_FEES]: "5.00% native ETH fee paid on secondary NARA Position NFT sales via NARAPositionSaleV5.",
    [LABELS.EXTERNAL_ROYALTY_FEES]: "External EIP-2981 NFT marketplace royalties paid in native ETH to NARARewardIngressV5.",
    [LABELS.SLIP_ISSUANCE_FEES]: "0.50% gross fee paid when sealing or re-transferring bearer slips on CryptoSLIP vaults.",
  },
  SupplySideRevenue: {
    [LABELS.SLIP_REFERRAL_FEES]: "50% share of the 0.50% CryptoSlipVaultV32 fee credited on-chain to referrers.",
  },
  Revenue: {
    [LABELS.HOOK_FEES_TO_PROTOCOL]: "100% of NARALiquidityHookV5 swap fees retained between POL and committed NARA holders.",
    [LABELS.POL_LP_FEES_TO_PROTOCOL]: "100% of POL LP fees retained between POL and committed NARA holders.",
    [LABELS.POSITION_SALE_FEES_TO_HOLDERS]: "100% of the 5.00% secondary position sale fee routed to committed NARA holders.",
    [LABELS.EXTERNAL_ROYALTIES_TO_HOLDERS]: "100% of external EIP-2981 position royalties routed to committed NARA holders.",
    [LABELS.SLIP_FEES_TO_TREASURY]: "Net CryptoSLIP issuance fees accrued to protocol treasury after referral splits.",
  },
  ProtocolRevenue: {
    [LABELS.HOOK_FEES_TO_PROTOCOL]: "Portion of NARALiquidityHookV5 swap fees allocated to Protocol-Owned Liquidity.",
    [LABELS.POL_LP_FEES_TO_PROTOCOL]: "Portion of POL LP fees allocated to Protocol-Owned Liquidity.",
    [LABELS.SLIP_FEES_TO_TREASURY]: "Net CryptoSLIP issuance fees accrued to protocol treasury.",
  },
  HoldersRevenue: {
    [LABELS.COMMITTED_POSITION_DISTRIBUTIONS]: "Hook swap fees, POL LP fees, 5.00% secondary position sale fees, and external EIP-2981 royalties distributed to committed NARA position holders via NARARewardLedgerV5.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // Hook and POL LP fees execute on Uniswap v4
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-11-02",
  methodology,
  breakdownMethodology,
};

export default adapter;
