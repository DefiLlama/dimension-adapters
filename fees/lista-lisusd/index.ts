import ADDRESSES from '../../helpers/coreAssets.json'
import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * Fetches data from Lista DAO
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-lisusd
 *
 * @treasury
 * https://bscscan.com/address/0x8d388136d578dcd791d081c6042284ced6d9b0c6#tokentxns
 * https://bscscan.com/address/0x34b504a5cf0ff41f8a480580533b6dda687fa3da#tokentxns
 */

const newTreasuryActivationTime = 1727222400 //2024-09-25;

const oldTreasury =
  "0x0000000000000000000000008d388136d578dcd791d081c6042284ced6d9b0c6";
const newTreasury =
  "0x00000000000000000000000034b504a5cf0ff41f8a480580533b6dda687fa3da";
const zeroAddress =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const transferHash =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HelioETHProvider = "0x0326c157bfF399e25dd684613aEF26DBb40D3BA4";
// const MasterVault = "0x986b40C2618fF295a49AC442c5ec40febB26CC54";
const SnBnbYieldConverterStrategy =
  "0x0000000000000000000000006f28fec449dbd2056b76ac666350af8773e03873";
const CeETHVault = "0xA230805C28121cc97B348f8209c79BEBEa3839C0";
const HayJoin = "0x4C798F81de7736620Cd8e6510158b1fE758e22F7";

// token
const lista = "0xFceB31A79F71AC9CBDCF853519c1b12D379EdC46";
const cake = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
const slisBNB = "0xb0b84d294e0c75a6abe60171b70edeb2efd14a1b";
const eth = ADDRESSES.bsc.ETH;
const wbeth = ADDRESSES.bsc.wBETH;
const bnb = ADDRESSES.bsc.WBNB;
const lisUSD = "0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5";
const usdt = ADDRESSES.bsc.USDT;
// sLisUSD savings pool (LisUSDPoolSet). Protocol reserve yield is funneled here and paid out to
// third-party sLisUSD depositors. Two contracts fund it: ListaRevenueDistributor (new treasury),
// funded by lisUSD revenue already counted in Fees, and EarnPool, which forwards PSM reserve yield
// (USDT deposited into Venus) that the Fees lines below do NOT otherwise capture.
const LisUSDPoolSet =
  "0x00000000000000000000000037db1ae9b24055d1f9fe973aea40b7eb2995d0bf";
// EarnPool: forwards PSM (USDT reserves -> Venus) yield into the sLisUSD savings pool. In practice
// this is ~94% of the pool's funding; the venusAdaptor -> treasury path is ~0 now.
const EarnPool =
  "0x00000000000000000000000066de07893db7492b56ba88503b4cc99bab1796f3";

// Liquidation profit: Moolah / broker liquidations settle their USDT profit to this receiver
const liquidatorProfitReceiver =
  "0x00000000000000000000000086e09296aeda129d3b0b4c134b3202b84cd8945c";
const liquidationProfitSources = [
  "0x0000000000000000000000006a87c15598929b2db22cf68a9a0dde5bf297a59a", // Liquidator
  "0x0000000000000000000000003aa647a1e902833b61e503dbbfbc58992daa4868", // BrokerLiquidator
  "0x000000000000000000000000ee3aa1af4ee231f2e1277a48fc4a2f29a3d7c028", // LiquidationVault
];

// Revenue breakdown labels
const ETH_STAKING_PROFIT = "ETH Staking Profit";
const BNB_STAKING_PROFIT = "BNB Liquid Staking Profit";
const BORROW_INTEREST = "Borrow Interest";
const VELISTA_EARLY_CLAIM_FEE = "veLista Early Claim Fee";
const LIQUIDATION_PROFIT = "Liquidation Profit";
const VELISTA_AUTO_COMPOUND_FEE = "veLista Auto Compound Fee";
const PSM_CONVERT_FEE = "PSM Convert Fee";
const USDT_STAKING_PROFIT = "USDT Staking Profit";
const VALIDATOR_REWARDS = "Validator Rewards";
const LP_STAKING_REWARDS = "LP Staking Rewards";
const FREEZE_LISTA = "Freeze LISTA";
const LSR_SAVINGS_COST = "sLisUSD Savings Cost";
const SAVINGS_YIELD = "sLisUSD Savings Yield";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const treasury = options.startOfDay>=newTreasuryActivationTime?newTreasury:oldTreasury;

  // eth staking profit - helioETHProvider and CeETHVault
  const ethStakingEth = await options.getLogs({
    target: eth,
    topics: [
      transferHash,
      "0x000000000000000000000000a230805c28121cc97b348f8209c79bebea3839c0",
      treasury,
    ],
  });

  const ethStakingWbeth = await options.getLogs({
    target: wbeth,
    topics: [
      transferHash,
      "0x000000000000000000000000a230805c28121cc97b348f8209c79bebea3839c0",
      treasury,
    ],
  });

  // BNB provide Fee - MasterVault
  // No fees charged for now

  // bnb liquid staking profit - SnBnbYieldConverterStrategy
  const bnbLiquidStakingProfit = await options.getLogs({
    target: slisBNB,
    topics: [transferHash, SnBnbYieldConverterStrategy, treasury],
  });

  // borrow lisUSD interest
  const borrowLisUSDInterest = await options.getLogs({
    target: lisUSD,
    topics: [transferHash, zeroAddress, treasury],
  });

  // veLista early claim penalty
  const veListaEarlyClaimPenalty = await options.getLogs({
    target: lista,
    topics: [
      transferHash,
      "0x000000000000000000000000d0c380d31db43cd291e2bbe2da2fd6dc877b87b3",
      treasury,
    ],
  });

  //liquidation profit - flash buy

  const liquidationProfit = await options.getLogs({
    target: lisUSD,
    topics: [
      transferHash,
      "0x0000000000000000000000009ba88e6b20041750fd4e6271fea455f5d44063cb",
      newTreasury,
    ],
  });

  // liquidation profit - liquidation bot
  const liquidationBot = await options.getLogs({
    target: lisUSD,
    topics: [
      transferHash,
      "0x00000000000000000000000008e83a96f4da5decc0e6e9084dde049a3e84ca04",
      treasury,
    ],
  });

  // PSM convert Fee
  const psmConvertFee = await options.getLogs({
    target: lisUSD,
    topics: [
      transferHash,
      "0x000000000000000000000000aa57f36dd5ef2ac471863ec46277f976f272ec0c",
      newTreasury,
    ],
  });

  // USDT staking profit - venusAdaptor
  const usdtStakingProfit = await options.getLogs({
    target: usdt,
    topics: [
      transferHash,
      "0x000000000000000000000000f76d9cfd08df91491680313b1a5b44307129cda9",
      "0x0000000000000000000000008d388136d578dcd791d081c6042284ced6d9b0c6",
    ],
  });

  // veLista Auto Compound Fee - VeListaAutoCompounder
  const veListaAutoCompoundFee = await options.getLogs({
    target: lista,
    topics: [
      transferHash,
      "0x0000000000000000000000009a0530a81c83d3b0dae720bf91c9254fecc3bf5e",
      newTreasury,
    ],
  });

  // validaator rewards - stake ListaDAOCredit
  const validatorRewards = await options.getLogs({
    target: "0x0D92Ac7a4590874a493eB62b37D3Ea3390966B13",
    // topics: [
    //   "0x8119d5d4b103c44e50f575099834c726e011a0ffd633ba386e8e0a0d61c659c3" // SafeReceived event topic
    // ],
    eventAbi: "event SafeReceived(address indexed sender, uint256 value)",
  });

  // LP staking rewards
  const lpStakeRewardsFromHash =
    "0x00000000000000000000000062dfec5c9518fe2e0ba483833d1bad94ecf68153";
  const lpStakeRewardsToHash =
    "0x00000000000000000000000085ce862c5bb61938ffcc97da4a80c8aae43c6a27";
  const lpStakingCakeRewards = await options.getLogs({
    target: cake,
    topics: [transferHash, lpStakeRewardsFromHash, lpStakeRewardsToHash],
  });
  const lpStakingListaRewards = await options.getLogs({
    target: lista,
    topics: [transferHash, lpStakeRewardsFromHash, lpStakeRewardsToHash],
  });

  // freeze lista
  const freezeLista = await options.getLogs({
    target: lista,
    topics: [
      transferHash,
      "0x000000000000000000000000e4153eb04417be05b8d6b2222e4cdd8ae674ee76",
      "0x000000000000000000000000000000000000000000000000000000000000dead",
    ],
  });

  // liquidation profit - USDT settled to the liquidator profit receiver. This receiver also
  // collects StableSwap pool fees, so query once and keep only the liquidation sources.
  const liquidationSourceSet = new Set(liquidationProfitSources.map((s) => s.toLowerCase()));
  const liquidationProfitUsdt = (
    await options.getLogs({
      target: usdt,
      topics: [transferHash, null, liquidatorProfitReceiver],
    })
  ).filter((log: any) => liquidationSourceSet.has((log.topics?.[1] ?? "").toLowerCase()));

  [...ethStakingEth].forEach((log) => {
    dailyFees.add(eth, Number(log.data), ETH_STAKING_PROFIT);
  });
  [...ethStakingWbeth].forEach((log) => {
    dailyFees.add(wbeth, Number(log.data), ETH_STAKING_PROFIT);
  });
  [...bnbLiquidStakingProfit].forEach((log) => {
    dailyFees.add(slisBNB, Number(log.data), BNB_STAKING_PROFIT);
  });
  [...borrowLisUSDInterest].forEach((log) => {
    dailyFees.add(lisUSD, Number(log.data), BORROW_INTEREST);
  });
  [...veListaEarlyClaimPenalty].forEach((log) => {
    dailyFees.add(lista, Number(log.data), VELISTA_EARLY_CLAIM_FEE);
  });
  [...liquidationProfit].forEach((log) => {
    dailyFees.add(lisUSD, Number(log.data), LIQUIDATION_PROFIT);
  });
  [...veListaAutoCompoundFee].forEach((log) => {
    dailyFees.add(lista, Number(log.data), VELISTA_AUTO_COMPOUND_FEE);
  });
  [...liquidationBot].forEach((log) => {
    dailyFees.add(lisUSD, Number(log.data), LIQUIDATION_PROFIT);
  });
  [...psmConvertFee].forEach((log) => {
    dailyFees.add(lisUSD, Number(log.data), PSM_CONVERT_FEE);
  });
  [...usdtStakingProfit].forEach((log) => {
    dailyFees.add(usdt, Number(log.data), USDT_STAKING_PROFIT);
  });
  [...validatorRewards].forEach((log) => {
    dailyFees.add(bnb, Number(log.value), VALIDATOR_REWARDS);
  });
  [...lpStakingListaRewards].forEach((log) => {
    dailyFees.add(lista, Number(log.data), LP_STAKING_REWARDS);
  });
  [...lpStakingCakeRewards].forEach((log) => {
    dailyFees.add(cake, Number(log.data), LP_STAKING_REWARDS);
  });
  [...freezeLista].forEach((log) => {
    dailyFees.subtractToken(lista, Number(log.data), FREEZE_LISTA);
  });
  [...liquidationProfitUsdt].forEach((log) => {
    dailyFees.add(usdt, Number(log.data), LIQUIDATION_PROFIT);
  });

  // sLisUSD savings cost (LSR): the protocol funds the sLisUSD savings pool (LisUSDPoolSet), whose
  // yield is paid to third-party sLisUSD depositors -> SupplySideRevenue. Two contracts fund it:
  //   1. ListaRevenueDistributor (newTreasury) — funded by lisUSD revenue already counted in the
  //      Fees lines above (borrow interest, etc.), so this leg only reduces Revenue (net-out).
  //   2. EarnPool — forwards PSM reserve yield (USDT deposited into Venus) into the pool. This
  //      yield does NOT reach the Fees lines above (the venusAdaptor -> treasury path is ~0 now;
  //      the yield is routed straight to savers), so it is grossed up into Fees and then paid out
  //      as SupplySideRevenue, leaving Revenue unchanged for this leg.
  const lsrCostFromTreasury = await options.getLogs({
    target: lisUSD,
    topics: [transferHash, newTreasury, LisUSDPoolSet],
  });
  const lsrCostFromEarnPool = await options.getLogs({
    target: lisUSD,
    topics: [transferHash, EarnPool, LisUSDPoolSet],
  });

  const treasuryLeg = options.createBalances();
  [...lsrCostFromTreasury].forEach((log) => {
    treasuryLeg.add(lisUSD, Number(log.data), LSR_SAVINGS_COST);
  });
  const earnPoolLeg = options.createBalances();
  [...lsrCostFromEarnPool].forEach((log) => {
    earnPoolLeg.add(lisUSD, Number(log.data), SAVINGS_YIELD);
  });

  // Revenue = collected income kept by the protocol, net of the treasury-funded savings payout.
  // Clone BEFORE grossing up the EarnPool yield so that yield does not inflate Revenue.
  const dailyRevenue = dailyFees.clone();
  dailyRevenue.subtract(treasuryLeg, LSR_SAVINGS_COST);

  // Gross up the PSM/Venus yield behind the EarnPool leg into Fees (it is missing from the lines
  // above); it is fully paid out to depositors, so Revenue is unaffected (add to Fees only).
  dailyFees.addBalances(earnPoolLeg, SAVINGS_YIELD);

  // SupplySideRevenue = everything paid to sLisUSD depositors (both funders).
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(treasuryLeg, LSR_SAVINGS_COST);
  dailySupplySideRevenue.addBalances(earnPoolLeg, LSR_SAVINGS_COST);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const LISUSD_BREAKDOWN = {
  [ETH_STAKING_PROFIT]: 'Profit from ETH / wBETH liquid staking (HelioETHProvider, CeETHVault)',
  [BNB_STAKING_PROFIT]: 'Profit from BNB liquid staking (SnBnbYieldConverterStrategy)',
  [BORROW_INTEREST]: 'Interest paid by lisUSD borrowers',
  [VELISTA_EARLY_CLAIM_FEE]: 'Penalty paid for claiming veLista rewards early',
  [LIQUIDATION_PROFIT]: 'Profit from CDP / lending liquidations',
  [VELISTA_AUTO_COMPOUND_FEE]: 'Fee taken on veLista auto-compounding',
  [PSM_CONVERT_FEE]: 'PSM (USDT) conversion fee',
  [USDT_STAKING_PROFIT]: 'Profit from USDT staking via VenusAdapter',
  [VALIDATOR_REWARDS]: 'BNB validator staking rewards',
  [LP_STAKING_REWARDS]: 'CAKE / LISTA rewards from PancakeSwap LP staking',
  [FREEZE_LISTA]: 'Frozen (burned) LISTA deducted from revenue',
};

const FEES_BREAKDOWN = {
  ...LISUSD_BREAKDOWN,
  [SAVINGS_YIELD]:
    'PSM reserve yield (USDT staked in Venus) routed via EarnPool to fund the sLisUSD savings rate — grossed up into Fees and paid out as the savings cost.',
};
const REVENUE_BREAKDOWN = {
  ...LISUSD_BREAKDOWN,
  [LSR_SAVINGS_COST]:
    'Treasury-funded (ListaRevenueDistributor) sLisUSD savings payout, deducted from revenue.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // ListaRevenueDistributor funds the sLisUSD savings pool in lumps, so on a distribution hour the
  // treasury-leg savings payout can exceed that hour's collected income and push Revenue negative.
  // This is expected lumpiness that nets out cumulatively (the borrow interest behind it was booked
  // in earlier hours) — keep such hours rather than throwing.
  allowNegativeValue: true,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2023-08-30",
    },
  },
  methodology: {
    Fees: 'All protocol income collected by Lista DAO on BSC (staking profits, borrow interest, liquidation profit, PSM/veLista/LP/validator fees, and the PSM/Venus reserve yield that funds the sLisUSD savings rate), net of frozen LISTA.',
    Revenue: 'Collected income kept by the protocol, net of the sLisUSD savings cost paid out to sLisUSD depositors.',
    ProtocolRevenue: 'Collected income kept by the protocol treasury, net of the sLisUSD savings cost.',
    SupplySideRevenue: 'lisUSD paid into the sLisUSD savings pool (LisUSDPoolSet) and distributed to third-party sLisUSD depositors — funded by ListaRevenueDistributor and by EarnPool (PSM/Venus reserve yield).',
  },
  breakdownMethodology: {
    Fees: FEES_BREAKDOWN,
    Revenue: REVENUE_BREAKDOWN,
    ProtocolRevenue: REVENUE_BREAKDOWN,
    SupplySideRevenue: { [LSR_SAVINGS_COST]: 'lisUSD paid into the sLisUSD savings pool (from ListaRevenueDistributor and EarnPool) and distributed to sLisUSD depositors.' },
  }
};

export default adapter;
