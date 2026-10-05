import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const config: Record<string, { parallelizer: string; start: string }> = {
  [CHAIN.AVAX]: {
    parallelizer: "0x41d58951cbd12D4Ef49b0437897677bbF5547C80",
    start: "2025-09-03",
  },
  [CHAIN.ETHEREUM]: {
    parallelizer: "0x6efeDDF9269c3683Ba516cb0e2124FE335F262a2",
    start: "2025-06-10",
  },
  [CHAIN.BASE]: {
    parallelizer: "0xC3BEF21Ea7dEB5C34CF33E918c8e28972C8048eD",
    start: "2025-06-20",
  },
  [CHAIN.HYPERLIQUID]: {
    parallelizer: "0x1250304F66404cd153fA39388DDCDAec7E0f1707",
    start: "2025-06-07",
  },
};

// https://docs.parallel.best/products/parallel-v3/stablecoins-and-savings/usdp-and-susdp/fee-distribution
// Pre-expiry  (before June 1, 2026): 90% sUSDp holders, 9% DAO Treasury, 1% Angle Labs (BUSL 1.1 PIP-50)
// Post-expiry (after  June 1, 2026): 90% sUSDp holders, 10% DAO Treasury
const SUSDP_RATIO = 0.90;
const DAO_RATIO = 0.09;
const DAO_POST_EXPIRY_RATIO = 0.10;
const ANGLE_LABS_RATIO = 0.01;
const ANGLE_LABS_LICENSE_EXPIRY = "2026-06-01";

const ABI = "function getCollateralRatio() view returns (uint64 collatRatio, uint256 stablecoinsIssued)";

// PRL buybacks by the Protocol & DAO Treasury multisig, counted as holders revenue on Ethereum:
// - CoW Swap buybacks (PGP-40, PGP-42): the multisig buys PRL with CoW Swap TWAP orders and the PRL bought is delivered
//   straight to the burn address. Counted automatically from the settlement's Trade events.
// - OTC buybacks: counted by their burn transactions, listed in OTC_BUYBACK_TXS. A future OTC buyback must be added there.
// Not counted: governance burns (PGP-37, PIP-65), sPRL1 early-exit penalty burns, and the penalties from other chains that
// the multisig relays to the burn address. A direct multisig -> burn transfer is not counted in general: it can be relayed
// penalties, which only the amounts received by the other chains' multisigs tell apart.
// https://docs.parallel.best/governance/dao-multisigs
// https://gov.parallel.best/t/pgp-40-prl-burn-phase-ii/536
const PRL = "0x6c0aeceeDc55c9d55d8B99216a670D85330941c3";
const DAO_TREASURY = "0x25Fc7ffa8f9da3582a36633d04804F0004706F9b";
const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const TRADE_EVENT = "event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";

// PGP-45: 100M PRL bought OTC from Mimo Labs, received as sPRL1 and unstaked, then burned in two transfers on 2026-09-24
// https://gov.parallel.best/t/pgp-45-otc-buyback-burn-of-100m-prl-from-mimo-labs/550
const OTC_BUYBACK_TXS = new Set([
  "0xe511e8db9efcd2657f285df696989de67de895327e9a4fb44a925642f530b228", // sPRL1 -> burn address, 48,370,287.70 PRL
  "0x4b1897e647b7c386b895ddae43586ecfb2b382be0fc0a35d00741d93952f9454", // treasury multisig -> burn address, 51,629,712.30 PRL
]);

const addPrlBuybacks = async (options: FetchOptions) => {
  const dailyHoldersRevenue = options.createBalances();
  const [trades, prlTransfers] = await Promise.all([
    options.getLogs({ target: COW_SETTLEMENT, eventAbi: TRADE_EVENT, onlyArgs: false }),
    options.getLogs({ target: PRL, eventAbi: TRANSFER_EVENT, onlyArgs: false }),
  ]);

  // PRL burned by a listed OTC buyback, and PRL that CoW Swap delivered to the burn address, per transaction and amount
  const burned = new Map<string, number>();
  for (const log of prlTransfers) {
    if (log.args.to.toLowerCase() !== BURN_ADDRESS.toLowerCase()) continue;
    const tx = log.transactionHash.toLowerCase();
    if (OTC_BUYBACK_TXS.has(tx)) {
      dailyHoldersRevenue.add(PRL, log.args.value, METRIC.TOKEN_BUY_BACK);
      continue;
    }
    if (log.args.from.toLowerCase() !== COW_SETTLEMENT.toLowerCase()) continue;
    const key = `${tx}-${log.args.value}`;
    burned.set(key, (burned.get(key) ?? 0) + 1);
  }

  // a treasury trade buying PRL counts once its PRL reached the burn address in the same transaction
  for (const log of trades) {
    if (log.args.owner.toLowerCase() !== DAO_TREASURY.toLowerCase() || log.args.buyToken.toLowerCase() !== PRL.toLowerCase()) continue;
    const key = `${log.transactionHash.toLowerCase()}-${log.args.buyAmount}`;
    const left = burned.get(key) ?? 0;
    if (!left) continue;
    burned.set(key, left - 1);
    dailyHoldersRevenue.add(PRL, log.args.buyAmount, METRIC.TOKEN_BUY_BACK);
  }
  return dailyHoldersRevenue;
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, chain, fromApi, toApi } = options;
  const { parallelizer } = config[chain];

  const [[crStart, stablesStart], [crEnd, stablesEnd]] = await Promise.all([
    fromApi.call({ abi: ABI, target: parallelizer }),
    toApi.call({ abi: ABI, target: parallelizer }),
  ]);

  // Net surplus = (collatRatio / 1e9 - 1) * stablecoinsIssued — excess collateral above USDp backing (USDp = $1)
  // Daily fees = surplus delta: captures yield from yield-bearing collateral + 0.05% burn fees
  const surplusStart = (Number(crStart) / 1e9 - 1) * Number(stablesStart) / 1e18;
  const surplusEnd = (Number(crEnd) / 1e9 - 1) * Number(stablesEnd) / 1e18;
  const dailyFeesUSD = surplusEnd - surplusStart;

  const licenseActive = options.dateString <= ANGLE_LABS_LICENSE_EXPIRY;
  const daoRatio = licenseActive ? DAO_RATIO : DAO_POST_EXPIRY_RATIO;

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  dailyFees.addUSDValue(dailyFeesUSD, "Yield From Backing Collateral");
  dailySupplySideRevenue.addUSDValue(dailyFeesUSD * SUSDP_RATIO, "Yield to sUSDp Savings Holders");
  dailyRevenue.addUSDValue(dailyFeesUSD * daoRatio, "Yield to DAO Treasury");
  if (licenseActive) dailyRevenue.addUSDValue(dailyFeesUSD * ANGLE_LABS_RATIO, "Yield to Angle Labs");
  dailyProtocolRevenue.addUSDValue(dailyFeesUSD * daoRatio, "Yield to DAO Treasury");

  // The buybacks are paid from the DAO Treasury's holdings, not from the day's surplus, so they are not added to dailyRevenue
  const dailyHoldersRevenue = chain === CHAIN.ETHEREUM ? await addPrlBuybacks(options) : createBalances();

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Daily change in protocol net surplus (total collateral value minus USDp outstanding). Captures yield from yield-bearing collateral held by the Parallelizer plus burn fees on yield-bearing redemptions.",
  Revenue: "DAO Treasury share of net surplus accrual: 9% before June 1, 2026 (plus 1% to Angle Labs under BUSL 1.1 PIP-50), and 10% thereafter (Angle Labs 1% redistributed to DAO post license expiry).",
  ProtocolRevenue: "DAO Treasury share of net surplus accrual: 9% before June 1, 2026, 10% after (Angle Labs 1% redistributed to DAO post license expiry).",
  SupplySideRevenue: "90% of net surplus accrual distributed to sUSDp savings holders.",
  HoldersRevenue: "PRL bought back by the Protocol & DAO Treasury multisig on Ethereum and burned, valued at the PRL price: CoW Swap buybacks (PGP-40, PGP-42), counted when the PRL bought reaches the burn address in the same transaction, and OTC buybacks, counted by their burn transactions (PGP-45, 24 September 2026). Governance burns (PGP-37, PIP-65), sPRL1 early-exit penalty burns and the penalties relayed from other chains are not buybacks and are not counted. The buybacks are paid from the DAO Treasury's holdings, not from the day's surplus, so they are not part of Revenue.",
};

const breakdownMethodology = {
  Fees: {
    "Yield From Backing Collateral": "Yield accrued on yield-bearing collateral held by the Parallelizer plus burn fees on yield-bearing redemptions.",
  },
  Revenue: {
    "Yield to DAO Treasury": "9% of net surplus accrual before June 1, 2026; 10% after (the 1% previously paid to Angle Labs is redistributed to the DAO Treasury post license expiry).",
    "Yield to Angle Labs": "1% of net surplus accrual paid to Angle Labs under BUSL 1.1 license (PIP-50), applicable only before June 1, 2026.",
  },
  ProtocolRevenue: {
    "Yield to DAO Treasury": "9% of net surplus accrual before June 1, 2026; 10% after (the 1% previously paid to Angle Labs is redistributed to the DAO Treasury post license expiry).",
  },
  SupplySideRevenue: {
    "Yield to sUSDp Savings Holders": "90% of net surplus accrual distributed to sUSDp stakers as savings yield.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "PRL bought back by the Protocol & DAO Treasury multisig and burned: CoW Swap TWAP buybacks since May 2026, and the PGP-45 OTC buyback of 100M PRL on 24 September 2026.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter:config,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
};

export default adapter;
