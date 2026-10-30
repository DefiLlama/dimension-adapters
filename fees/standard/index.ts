// STANDARD (standard.money) on Robinhood Chain (chainId 4663).
//
// STANDARD is a charter economy: a governance token (STANDARD) issued to charter
// holders, a STANDARD/ETH Uniswap v4 pool whose hook taxes every swap in ETH,
// charter auctions paid in ETH, a launchpad whose trade fees are paid in the
// launch's pair asset (a tokenized stock or WETH), treasury-owned liquidity in
// hooked stock/USDG pools and an ETH/USDG pool, and an S-Bills savings product
// paid in STANDARD.
//
// Fees (gross, everything users pay into the system):
//   - STANDARD/ETH swap tax (TaxHook.TaxCollected, ETH) and LP-exit tax (LpTaxCollected)
//   - charter auction prices (CharterAuction.CharterPurchased, ETH)
//   - launchpad trade fees: protocol share (stock/WETH transfers to the fee
//     multisig) + creator share (FeeEscrow.Credited), and the fixed launch fee
//   - LP fees on the protocol's v4 pools, from PoolManager.Swap (|input| x fee)
//   - license auctions and charter exit fees, paid in STANDARD ledger credit and
//     retired or recycled (CentralBank, LicenseAuction)
//   - S-Bills early-exit fees (SBills.Exited, STANDARD)
// Supply side: creator fee share, third-party LP share of pool fees, informant
//   bounties on revocations.
// Revenue = Fees - SupplySide.
// Holders revenue: STANDARD bought with fee ETH by PolBuyback and ContractionVault
//   (ETH spent, recognised when the buyback executes), and STANDARD retired or
//   burned out of fees, including the STANDARD side of the STANDARD/ETH LP fee,
//   which the protocol-owned position burns. S-Bills premiums distribute the
//   bought-back STANDARD and are therefore already covered by the buyback line.
// Protocol revenue is recognised when fees reach the protocol's contracts: the
//   fee splitter, the fee multisig, the treasury's pool positions and the charter
//   ledger. Buybacks executed later from those balances are recognised as holders
//   revenue on their own schedule.
//
// STANDARD is not on a price feed DefiLlama knows, so STANDARD amounts are converted to
// ETH at the canonical STANDARD/ETH pool's spot price read from PoolManager storage.
// -----------------------------------------------------------------------------
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";
import { ChainApi } from "@defillama/sdk";

const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const TAX_HOOK = "0xF1eE073811B14359D850825E48d200483200eDcd";
const CENTRAL_BANK = "0x5977B25419f9c0dDcB2F89fE204955622f4F57ea";
const POL_BUYBACK = "0x50e4C444f71dF2Db8593c6c8ba4d493De618E147";
const CONTRACTION_VAULT = "0x796e80E8ABcedc30c700A9587F7933d3342B8946";
const SBILLS = "0x163B36fD07622486CB889fEEf97BfBe2c1D7c05B";
const FEE_MULTISIG = "0x047829087f9AC81fDb05F7b750458aFE3d72415f";

const CHARTER_AUCTIONS = [
  "0x1E369e5977e1d90D9A1Ec52aC72a124346E622E4", // v2, live
  "0x65B4f85b4A64424F6bA0fFe0C535100bc6888892", // genesis, retired
];
const LICENSE_AUCTIONS = [
  "0x7CD3c6ec047B1A21ea65AF64D7c850e6f6049015", // live
  "0x44731EFf9da8fDD30003AA7C0B324368B3DfFE5e", // periphery v2, retired
  "0xA45CE49303EEd5846F841BFd4bAC6aE8C805EC05", // genesis, retired
];
const LAUNCH_FACTORIES: { address: string; launchedTopic: string }[] = [
  { address: "0x3D6Ea4e97B8AB9E1A1B4943fEBfFe22D8c920091", launchedTopic: "0xa0354dae199953f2dbde6be8415166a744e7f92b7328671692196d8fdbb6bd9d" }, // v1
  { address: "0x3D69104Da2518f4833D71444D6611310F2D685f2", launchedTopic: "0x93e9aed10a0259070dbc9cbe242cfd7dfde85172011e531fff069983bfeb470f" }, // v2
];
const FEE_ESCROWS = [
  "0xcbC8f65EF158c829379472DEe771cF3E7741440E", // v1
  "0x479B2997a7283f7d3baacc984558fe4e1D7467af", // v2
];
const LAUNCH_FEE_WEI = 500000000000000n; // 0.0005 ETH per launch, both factories

const STANDARD = "0x88ad8DdF1E3898412146a534538d418c6F8A9062";
const WETH = ADDRESSES.robinhood.WETH;
const USDG = ADDRESSES.robinhood.USDG;
const SPCX = "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa";
const SKHY = "0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8";
const BABA = "0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4";
// Assets the launchpad takes fees in. Protocol fees arrive at the fee multisig
// as plain transfers of these tokens.
const LAUNCH_PAIR_ASSETS = [SPCX, SKHY, BABA, WETH];

// Protocol-owned v4 pools. treasuryShare is the Treasury Safe's share of each
// pool's liquidity, measured from its on-chain positions on 2026-10-21; the
// remainder is third-party LP income and is reported as supply side.
const STD_ETH_POOL_ID = "0xc73f3cd3fb68288e63f008e08ef69caa0437224e420963c6aeb4526178e87ad9";
const POOLS: { id: string; currency0: string; currency1: string; label: string; treasuryShare: number }[] = [
  { id: STD_ETH_POOL_ID, currency0: ADDRESSES.null, currency1: STANDARD, label: "STANDARD/ETH LP Fees", treasuryShare: 1 },
  { id: "0x1f5bf0b4df6d26da68a30535727acaf41634443b6421bcecd8ac1d455b2f91d6", currency0: SPCX, currency1: USDG, label: "Stock Pool LP Fees", treasuryShare: 0.95 },
  // v4 orders currencies by address: USDG (0x5fc5...) sorts below SKHY and BABA but above SPCX.
  { id: "0x742282d7cd423bacc97e7f07121bbd7958d03059f8accfada01a0c5efc903397", currency0: USDG, currency1: SKHY, label: "Stock Pool LP Fees", treasuryShare: 1 },
  { id: "0xfe709115a71c7f9c007f2ac9cb932071ff3b3117865122134e2c1bd96719734c", currency0: USDG, currency1: BABA, label: "Stock Pool LP Fees", treasuryShare: 1 },
  { id: "0x387bf619da4d3fb62bb276482693dba1b9b3520f573cabdfe033384a24125982", currency0: ADDRESSES.null, currency1: USDG, label: "ETH/USDG LP Fees", treasuryShare: 0.53 },
];

// Where the PolBuyback flow is recognised as holders revenue: at the buyback
// ("source") or when the bought STANDARD is paid out as S-Bills premiums
// ("payout"). One stage of the same flow, never both.
const SBILLS_BASIS: "source" | "payout" = "source";

const EVENTS = {
  taxCollected: "event TaxCollected(bool isBuy, uint256 amount)",
  lpTaxCollected: "event LpTaxCollected(address indexed sender, uint256 ethAmount, uint256 tokenAmount)",
  charterPurchased: "event CharterPurchased(uint256 indexed charterId, address indexed buyer, uint256 indexed day, uint256 price)",
  licensesPurchased: "event LicensesPurchased(uint256 indexed charterId, uint256 indexed day, uint256 count, uint256 unitPrice)",
  withdrawn: "event Withdrawn(uint256 indexed charterId, address indexed to, uint256 branchesDestroyed, uint256 gross, uint256 feeWad, uint256 net)",
  revoked: "event Revoked(uint256 indexed charterId, address indexed owner, address indexed informant, uint256 gross, uint256 bounty, uint256 ownerNet)",
  transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
  credited: "event Credited(address indexed curve, address indexed stock, uint256 amount)",
  swap: "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  polBuyback: "event BuybackExecuted(uint256 ethSpent, uint256 tokensBought, address indexed vault)",
  contractionBuyback: "event BuybackExecuted(uint256 ethSpent, uint256 tokensBurned)",
  sbillsExited: "event Exited(uint256 indexed id, address indexed owner, uint256 principal, uint256 fee, uint256 vestedForfeited, uint256 bonusForfeited)",
  sbillsRedeemed: "event Redeemed(uint256 indexed id, address indexed owner, uint256 principal, uint256 premium, uint256 bonus)",
  sbillsRolled: "event Rolled(uint256 indexed id, uint256 ratePaid, uint256 premium, uint64 maturity, uint256 bonusCollected, uint256 newPrincipal)",
};
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const LABELS = {
  swapTax: "STANDARD/ETH Swap Tax",
  lpExitTax: "STANDARD/ETH LP Exit Tax",
  charterAuctions: "Charter Auctions",
  launchpadProtocol: "Launchpad Fees To Protocol",
  launchpadCreator: "Launchpad Fees To Creators",
  launchFee: "Launch Fees",
  lpTreasury: "Treasury LP Fees",
  lpThirdParty: "Third-Party LP Fees",
  licenseAuctions: "License Auctions",
  exitFees: "Charter Exit Fees",
  informantBounty: "Revocation Bounties",
  sbillsExit: "S-Bills Exit Fees",
  sbillsPremium: "S-Bills Premiums",
  stdBurn: "STANDARD Retired From Fees",
};

const pad32 = (address: string) => "0x" + address.toLowerCase().replace("0x", "").padStart(64, "0");

// ETH per STANDARD. Taken from the last STANDARD/ETH swap in the window; when
// the window has no swap, from the pool's slot0 at the latest block, since the
// public RPCs do not serve historical state. PoolManager keeps pools in a mapping
// at storage slot 6 and slot0 is its first word with sqrtPriceX96 in the low 160
// bits. currency0 is ETH and currency1 is STANDARD, so price1/0 = (sqrtP / 2^96)^2.
async function stdToEthRatio(options: FetchOptions, stdPoolSwaps: { sqrtPriceX96: string }[]): Promise<(stdWei: bigint) => bigint> {
  let sqrtP = stdPoolSwaps.length ? BigInt(stdPoolSwaps[stdPoolSwaps.length - 1].sqrtPriceX96) : 0n;
  if (sqrtP === 0n) {
    const { ethers } = await import("ethers");
    const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [STD_ETH_POOL_ID, 6]));
    const latest = new ChainApi({ chain: options.chain });
    const word: string = await latest.call({ target: POOL_MANAGER, abi: "function extsload(bytes32 slot) view returns (bytes32)", params: [slot] });
    sqrtP = BigInt(word) & ((1n << 160n) - 1n);
  }
  if (sqrtP === 0n) throw new Error("STANDARD/ETH pool price unavailable");
  const q192 = 1n << 192n;
  return (stdWei: bigint) => (stdWei * q192) / (sqrtP * sqrtP);
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const swapsByPool: Record<string, { amount0: string; amount1: string; fee: string; sqrtPriceX96: string }[]> = {};
  for (const pool of POOLS) swapsByPool[pool.id] = await options.getLogs({ target: POOL_MANAGER, eventAbi: EVENTS.swap, topics: [SWAP_TOPIC, pool.id] });
  const toEth = await stdToEthRatio(options, swapsByPool[STD_ETH_POOL_ID]);
  const addStd = (bal: ReturnType<typeof options.createBalances>, stdWei: bigint, label: string) => bal.addGasToken(toEth(stdWei), label);

  // 1. STANDARD/ETH hook taxes, ETH to the FeeSplitter.
  const taxLogs = await options.getLogs({ target: TAX_HOOK, eventAbi: EVENTS.taxCollected });
  for (const log of taxLogs) dailyFees.addGasToken(log.amount, LABELS.swapTax);
  const lpTaxLogs = await options.getLogs({ target: TAX_HOOK, eventAbi: EVENTS.lpTaxCollected });
  for (const log of lpTaxLogs) {
    dailyFees.addGasToken(log.ethAmount, LABELS.lpExitTax);
    addStd(dailyFees, BigInt(log.tokenAmount), LABELS.lpExitTax);
    addStd(dailyHoldersRevenue, BigInt(log.tokenAmount), LABELS.stdBurn);
  }

  // 2. Charter auctions, ETH to the FeeSplitter.
  const charterLogs = await options.getLogs({ targets: CHARTER_AUCTIONS, eventAbi: EVENTS.charterPurchased });
  for (const log of charterLogs) dailyFees.addGasToken(log.price, LABELS.charterAuctions);

  // 3. Launchpad. Protocol share lands at the fee multisig as a token transfer;
  //    creator share is credited in FeeEscrow; launch fee is fixed per launch.
  const toMultisig = await options.getLogs({
    targets: LAUNCH_PAIR_ASSETS, eventAbi: EVENTS.transfer, flatten: false,
    topics: [TRANSFER_TOPIC, null, pad32(FEE_MULTISIG)],
  });
  toMultisig.forEach((logs: { value: string }[], i: number) => {
    for (const log of logs) dailyFees.add(LAUNCH_PAIR_ASSETS[i], log.value, LABELS.launchpadProtocol);
  });
  const creditedLogs = await options.getLogs({ targets: FEE_ESCROWS, eventAbi: EVENTS.credited });
  for (const log of creditedLogs) {
    dailyFees.add(log.stock, log.amount, LABELS.launchpadCreator);
    dailySupplySideRevenue.add(log.stock, log.amount, LABELS.launchpadCreator);
  }
  for (const factory of LAUNCH_FACTORIES) {
    const launched = await options.getLogs({ target: factory.address, topic: factory.launchedTopic, onlyArgs: false, entireLog: true });
    dailyFees.addGasToken(BigInt(launched.length) * LAUNCH_FEE_WEI, LABELS.launchFee);
  }

  // 4. LP fees on protocol-owned v4 pools. Fee is charged on the input side;
  //    the swapper's negative delta is what went in.
  for (const pool of POOLS) {
    for (const log of swapsByPool[pool.id]) {
      const a0 = BigInt(log.amount0);
      const a1 = BigInt(log.amount1);
      const fee = BigInt(log.fee);
      if (fee === 0n) continue;
      const [token, amountIn] = a0 < 0n ? [pool.currency0, -a0] : [pool.currency1, -a1];
      if (amountIn <= 0n) continue;
      const feeAmount = (amountIn * fee) / 1_000_000n;
      const treasury = (feeAmount * BigInt(Math.round(pool.treasuryShare * 1e6))) / 1_000_000n;
      const others = feeAmount - treasury;
      const add = (bal: ReturnType<typeof options.createBalances>, amt: bigint, label: string) =>
        token === STANDARD ? addStd(bal, amt, label) : token === ADDRESSES.null ? bal.addGasToken(amt, label) : bal.add(token, amt, label);
      add(dailyFees, treasury, LABELS.lpTreasury);
      // The protocol-owned position burns the STANDARD side of its STANDARD/ETH fees.
      if (pool.id === STD_ETH_POOL_ID && token === STANDARD) addStd(dailyHoldersRevenue, treasury, LABELS.stdBurn);
      if (others > 0n) {
        add(dailyFees, others, LABELS.lpThirdParty);
        add(dailySupplySideRevenue, others, LABELS.lpThirdParty);
      }
    }
  }

  // 5. STANDARD-denominated charter fees. License purchases retire ledger credit;
  //    exit fees are half recycled to remaining charters, half retired. Both
  //    sides accrue to STANDARD holders.
  const licenseLogs = await options.getLogs({ targets: LICENSE_AUCTIONS, eventAbi: EVENTS.licensesPurchased });
  for (const log of licenseLogs) {
    const paid = BigInt(log.count) * BigInt(log.unitPrice);
    addStd(dailyFees, paid, LABELS.licenseAuctions);
    addStd(dailyHoldersRevenue, paid, LABELS.licenseAuctions);
  }
  const withdrawnLogs = await options.getLogs({ target: CENTRAL_BANK, eventAbi: EVENTS.withdrawn });
  for (const log of withdrawnLogs) {
    const fee = BigInt(log.gross) - BigInt(log.net);
    addStd(dailyFees, fee, LABELS.exitFees);
    addStd(dailyHoldersRevenue, fee, LABELS.exitFees);
  }
  const revokedLogs = await options.getLogs({ target: CENTRAL_BANK, eventAbi: EVENTS.revoked });
  for (const log of revokedLogs) {
    const fee = BigInt(log.gross) - BigInt(log.ownerNet);
    const bounty = BigInt(log.bounty);
    addStd(dailyFees, fee, LABELS.exitFees);
    addStd(dailySupplySideRevenue, bounty, LABELS.informantBounty);
    addStd(dailyHoldersRevenue, fee - bounty, LABELS.exitFees);
  }

  // 6. Buybacks of STANDARD on the canonical pool, funded by fee ETH routed
  //    through the fee splitter. Recognised when they execute.
  const polLogs = await options.getLogs({ target: POL_BUYBACK, eventAbi: EVENTS.polBuyback });
  if (SBILLS_BASIS === "source") for (const log of polLogs) dailyHoldersRevenue.addGasToken(log.ethSpent, METRIC.TOKEN_BUY_BACK);
  const contractionLogs = await options.getLogs({ target: CONTRACTION_VAULT, eventAbi: EVENTS.contractionBuyback });
  for (const log of contractionLogs) dailyHoldersRevenue.addGasToken(log.ethSpent, METRIC.TOKEN_BUY_BACK);

  // 7. S-Bills. Exit fees are paid by early leavers: half burned, half to the
  //    bills still locked. Premiums distribute STANDARD bought by PolBuyback.
  const exitedLogs = await options.getLogs({ target: SBILLS, eventAbi: EVENTS.sbillsExited });
  for (const log of exitedLogs) {
    addStd(dailyFees, BigInt(log.fee), LABELS.sbillsExit);
    addStd(dailyHoldersRevenue, BigInt(log.fee), LABELS.sbillsExit);
  }
  if (SBILLS_BASIS === "payout") {
    const redeemed = await options.getLogs({ target: SBILLS, eventAbi: EVENTS.sbillsRedeemed });
    for (const log of redeemed) addStd(dailyHoldersRevenue, BigInt(log.premium), LABELS.sbillsPremium);
    // A roll folds the matured premium into principal and escrows the renewed
    // term's premium, which the event carries.
    const rolled = await options.getLogs({ target: SBILLS, eventAbi: EVENTS.sbillsRolled });
    for (const log of rolled) addStd(dailyHoldersRevenue, BigInt(log.premium), LABELS.sbillsPremium);
  }

  const dailyRevenue = dailyFees.clone();
  // Net each supply-side line out of revenue under the fee label it came from.
  for (const [label, breakdown] of Object.entries(dailySupplySideRevenue.getBreakdownBalances())) {
    dailyRevenue.subtract(breakdown, label === LABELS.informantBounty ? LABELS.exitFees : label);
  }
  // Protocol revenue is recognised on receipt; buybacks from those balances are
  // recognised as holders revenue when they execute.
  const dailyProtocolRevenue = dailyRevenue.clone();

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-15",
  fetch,
  methodology: {
    Fees: "Everything paid into STANDARD: the ETH tax on every STANDARD/ETH swap and LP exit, charter auction prices in ETH, launchpad trade fees in the launch's pair asset plus the fixed launch fee, LP fees on the protocol's Uniswap v4 pools, license auction payments and charter exit fees paid in STANDARD, and S-Bills early-exit fees. STANDARD amounts are valued at the canonical STANDARD/ETH pool spot price.",
    UserFees: "Swap taxes, auction prices, launchpad trade fees, pool swap fees and exit fees are all paid by users.",
    SupplySideRevenue: "The creator share of launchpad trade fees, the third-party LP share of fees on the protocol's pools, and informant bounties on charter revocations.",
    Revenue: "Fees minus the supply side: the part of fees kept by the protocol and its token holders.",
    ProtocolRevenue: "Revenue received by the protocol: swap and LP-exit taxes and auction proceeds at the fee splitter, launchpad protocol fees and launch fees at the fee multisig, the treasury's LP fee income, and STANDARD fees paid to the charter system. Buybacks funded from these balances are reported as holders revenue when they execute.",
    HoldersRevenue: "ETH spent by PolBuyback and the ContractionVault buying STANDARD on the canonical pool, recognised when each buyback executes, plus STANDARD retired or burned out of fees: license auction payments, charter exit fees, the STANDARD side of the LP-exit tax and of the STANDARD/ETH pool fee, and S-Bills exit fees. S-Bills premiums distribute the bought-back STANDARD and are covered by the buyback line.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.swapTax]: "ETH tax charged by the TaxHook on every STANDARD/ETH swap (TaxCollected), 2% on buys and 3% on sells at steady state.",
      [LABELS.lpExitTax]: "ETH and STANDARD tax charged by the TaxHook when non-protocol liquidity exits the STANDARD/ETH pool (LpTaxCollected).",
      [LABELS.charterAuctions]: "ETH paid for charters in the daily charter auction (CharterPurchased).",
      [LABELS.launchpadProtocol]: "Protocol share of launchpad trade fees, received by the fee multisig in the launch's pair asset.",
      [LABELS.launchpadCreator]: "Creator share of launchpad trade fees credited in FeeEscrow.",
      [LABELS.launchFee]: "Fixed 0.0005 ETH fee per token launch, counted from Launched events.",
      [LABELS.lpTreasury]: "Treasury Safe's share of swap fees on the protocol's v4 pools, from PoolManager Swap events.",
      [LABELS.lpThirdParty]: "Third-party LPs' share of swap fees on the protocol's v4 pools.",
      [LABELS.licenseAuctions]: "STANDARD paid for branch licenses and retired from the ledger (LicensesPurchased).",
      [LABELS.exitFees]: "STANDARD fee charged on charter withdrawals and revocations (Withdrawn, Revoked).",
      [LABELS.sbillsExit]: "STANDARD fee charged on S-Bills early exits (Exited).",
    },
    SupplySideRevenue: {
      [LABELS.launchpadCreator]: "Creator share of launchpad trade fees.",
      [LABELS.lpThirdParty]: "Third-party LPs' share of pool swap fees.",
      [LABELS.informantBounty]: "Bounty paid to the informant on a charter revocation.",
    },
    Revenue: {
      [LABELS.swapTax]: "ETH swap tax, kept in full.",
      [LABELS.lpExitTax]: "LP-exit tax, kept in full.",
      [LABELS.charterAuctions]: "Charter auction proceeds, kept in full.",
      [LABELS.launchpadProtocol]: "Protocol share of launchpad trade fees.",
      [LABELS.launchpadCreator]: "Creator share, netted out to the supply side.",
      [LABELS.launchFee]: "Launch fees, kept in full.",
      [LABELS.lpTreasury]: "Treasury's share of pool swap fees.",
      [LABELS.lpThirdParty]: "Third-party LP share, netted out to the supply side.",
      [LABELS.licenseAuctions]: "License payments retired from supply.",
      [LABELS.exitFees]: "Charter exit fees net of informant bounties.",
      [LABELS.sbillsExit]: "S-Bills exit fees.",
    },
    ProtocolRevenue: {
      [LABELS.swapTax]: "ETH swap tax received by the fee splitter.",
      [LABELS.lpExitTax]: "LP-exit tax in ETH and STANDARD.",
      [LABELS.charterAuctions]: "Charter auction ETH received by the fee splitter.",
      [LABELS.launchpadProtocol]: "Launchpad protocol fees at the fee multisig.",
      [LABELS.launchpadCreator]: "Creator share, netted out to the supply side.",
      [LABELS.launchFee]: "Launch fees at the fee multisig.",
      [LABELS.lpTreasury]: "Treasury's LP fee income.",
      [LABELS.lpThirdParty]: "Third-party LP share, netted out to the supply side.",
      [LABELS.licenseAuctions]: "STANDARD paid for licenses.",
      [LABELS.exitFees]: "Charter exit fees net of informant bounties.",
      [LABELS.sbillsExit]: "S-Bills exit fees.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "ETH spent by PolBuyback and the ContractionVault buying STANDARD on the canonical pool.",
      [LABELS.stdBurn]: "STANDARD burned by the protocol-owned liquidity: the STANDARD side of the LP-exit tax and the STANDARD side of the 1% STANDARD/ETH pool fee.",
      [LABELS.licenseAuctions]: "STANDARD paid for licenses and retired from supply.",
      [LABELS.exitFees]: "Charter exit fees in STANDARD, half recycled to remaining charters and half retired.",
      [LABELS.sbillsExit]: "S-Bills exit fees in STANDARD, half burned and half paid to remaining bills.",
      [LABELS.sbillsPremium]: "S-Bills premiums paid to bill holders in STANDARD, when the PolBuyback flow is recognised at payout rather than at the buyback.",
    },
  },
};

export default adapter;
