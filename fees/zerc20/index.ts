import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// zERC20 — private ERC-20 transfers.
// v1 (Feb–Sep 2026): zk proof-of-burn; fees modelled below because v1 does not emit them.
// v2 (Oct 2026 on): notes in a Merkle tree behind one Verifier; the protocol fee is emitted
// on-chain (FeeAccrued), so it is read exactly. v1 still runs, so both are counted.
// v1 addresses: github.com/kbizikav/zERC20/tree/main/config/deployed/mainnet (zJPYC LiquidityManager located on-chain).
// v2 addresses: docs.zerc20.io/developers/contracts — identical on every v2 chain.
const zETH = "0x410056c6F0A9ABD8c42b9eEF3BB451966Fb0d924";
const zUSDC = "0xEB81ab55Bc7aa89d1e0E3F60597D86e37702Af53";
const zBNB = "0x4388D5618B9e13Bd580209CDf37a202778C75c54";
const zJPYC = "0xd33Bed4Ae7Fe50107c532f63740B1bF2dabf2b30";
const JPYC = "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29";
const zETH_LM = "0xcC10b7098FEf1aB2f0FF3bE91d2A7B3230b90CF0";
const zUSDC_LM = "0x04be137Df79bE7B5F3314C4a84D1C5E0d99BD477";
const zJPYC_LM = "0x12609C3A7a1A212953417c90472cdcf034965a1C";

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
const V2_WITHDRAW_FEE = "Withdrawal Fees (v2)";
const V2_MERGE_FEE = "Merge Fees (v2)";

// ── v2 ──────────────────────────────────────────────────────────────────────
const V2_VERIFIER = "0x4D14355C3fC905446908d70190eADf36F34DB711";
const V2_FACTORY = "0xFB488dC9eCdeEd12e126986b8Bb441d6b14CdE58";
const NATIVE = ADDRESSES.GAS_TOKEN_2;
// v2 was deployed 2026-10-20/21 (deployment blocks on the contracts page); nothing earlier.
const V2_LIVE = 1792454400; // 2026-10-20 00:00 UTC
// Kaia is a v1-only chain.
const V2_CHAINS = new Set<string>([CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.BSC, CHAIN.POLYGON]);
const FEE_ACCRUED_EVENT = "event FeeAccrued(uint32 indexed tokenId, address indexed recipient, uint256 amount)";
const MERGED_EVENT = "event Merged(address indexed caller, uint32 indexed tokenId, uint256 indexed commitmentRoot, uint256 inputCount, uint256 noteHash, uint64 noteIndex)";

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

  await addV2Fees(options, dailyFees);

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

/**
 * v2 protocol fees, read exactly from the Verifier's FeeAccrued events. Every v2 withdrawal
 * emits one carrying the fee it withheld (cross-checked 2026-11-03: equal to
 * Transacted.feeAmount on all 80 withdrawals indexed, and 0.35% of each, the entry tier).
 * Merges accrue a small fee too, through the same event; a FeeAccrued in the same
 * transaction as a Merged event is labelled as a merge fee, every other one as a
 * withdrawal fee, so the breakdown shows which operation paid it.
 * Token ids are assigned per chain, so each is resolved through ZERC20Factory.tokenById and
 * the zToken's underlyingAsset — a newly listed token needs no change here.
 */
async function addV2Fees(options: FetchOptions, dailyFees: any) {
  if (!V2_CHAINS.has(options.chain) || options.endTimestamp < V2_LIVE) return;
  const feeLogs = await options.getLogs({ target: V2_VERIFIER, eventAbi: FEE_ACCRUED_EVENT, onlyArgs: false });
  if (!feeLogs.length) return;
  const mergeLogs = await options.getLogs({ target: V2_VERIFIER, eventAbi: MERGED_EVENT, onlyArgs: false });
  const mergeTxs = new Set(mergeLogs.map((l: any) => l.transactionHash.toLowerCase()));

  // tokenId -> { withdraw, merge } totals
  const byTokenId = new Map<number, { withdraw: bigint; merge: bigint }>();
  for (const log of feeLogs) {
    const id = Number(log.args.tokenId);
    const entry = byTokenId.get(id) ?? { withdraw: 0n, merge: 0n };
    if (mergeTxs.has(log.transactionHash.toLowerCase())) entry.merge += BigInt(log.args.amount);
    else entry.withdraw += BigInt(log.args.amount);
    byTokenId.set(id, entry);
  }
  const ids = [...byTokenId.keys()];
  const zTokens: string[] = await options.api.multiCall({
    target: V2_FACTORY, abi: "function tokenById(uint32) view returns (address)", calls: ids });
  const underlyings: string[] = await options.api.multiCall({
    abi: "function underlyingAsset() view returns (address)", calls: zTokens });

  ids.forEach((id, i) => {
    const { withdraw, merge } = byTokenId.get(id)!;
    const isNative = underlyings[i].toLowerCase() === NATIVE;
    for (const [amount, label] of [[withdraw, V2_WITHDRAW_FEE], [merge, V2_MERGE_FEE]] as [bigint, string][]) {
      if (amount === 0n) continue;
      if (isNative) dailyFees.addGasToken(amount, label);
      else dailyFees.add(underlyings[i], amount, label);
    }
  });
}

const methodology = {
  Fees: "Fees users pay to move tokens privately: since 2026-10-20 a v2 withdrawal fee (0.35% below $10k, tapering to 0.08% above $10M) and a small fee for merging notes, plus on v1 a 0.35% redeem fee on private transfers (since 2026-06-02) and an unwrap fee for converting zTokens back to the underlying token that rises as liquidity runs low; relayer and third-party referral fees are excluded.",
  UserFees: "All zERC20 fees are paid directly by users: v2 withdrawal and note-merge fees, and v1 redeem fees on private transfers and unwrap fees.",
  Revenue: "All v2 withdrawal and note-merge fees and all v1 redeem and unwrap fees paid by users are kept by the protocol.",
  ProtocolRevenue: "All v2 withdrawal and note-merge fees and all v1 redeem and unwrap fees paid by users go to the protocol: v2 fees to its fee-recipient address, v1 fees as surplus backing in its liquidity reserves.",
};

const feesBreakdown = {
  [V2_WITHDRAW_FEE]: "Fee withheld from each v2 withdrawal: 0.35% below $10k, tapering to 0.08% above $10M.",
  [V2_MERGE_FEE]: "Small fee charged when a user merges several v2 notes into one.",
  [REDEEM_FEE]: "0.35% of each v1 private transfer, withheld before the recipient's zTokens are minted (since 2026-06-02).",
  [UNWRAP_FEE]: "Fee for unwrapping v1 zTokens back to the underlying token; the rate rises as liquidity falls below target (zBNB is exempt).",
};

const breakdownMethodology = {
  Fees: feesBreakdown,
  UserFees: feesBreakdown,
  Revenue: {
    [V2_WITHDRAW_FEE]: "v2 withdrawal fees, kept by the protocol.",
    [V2_MERGE_FEE]: "v2 note-merge fees, kept by the protocol.",
    [REDEEM_FEE]: "v1 redeem fees on private transfers, kept by the protocol.",
    [UNWRAP_FEE]: "v1 unwrap fees, kept by the protocol.",
  },
  ProtocolRevenue: {
    [V2_WITHDRAW_FEE]: "v2 withdrawal fees sent to the protocol's fee-recipient address.",
    [V2_MERGE_FEE]: "v2 note-merge fees sent to the protocol's fee-recipient address.",
    [REDEEM_FEE]: "v1 redeem fees, never minted to the recipient, so they stay as surplus backing in the protocol's reserves.",
    [UNWRAP_FEE]: "v1 unwrap fees, added to the protocol's fee surplus in the liquidity reserve.",
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
