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
// sLisUSD savings pool (LisUSDPoolSet) — a MakerDAO-DSR-style pool. Depositor value accrues
// synthetically at the `duty` per-second rate via the getRate() index (getRate = rpow(duty, dt) *
// rate); the treasury tops the pool up in lisUSD to keep it solvent. The interest earned by
// third-party sLisUSD depositors is SupplySideRevenue, measured as the exact rate accrual over the
// period (totalSupply * ΔgetRate / RATE_SCALE) — NOT the lumpy top-up transfers and NOT the
// EarnPool deposits (which are user principal: USDT sold via PSM into lisUSD via depositFor).
const LISUSD_POOL_SET = "0x37DB1AE9B24055D1F9fE973Aea40B7EB2995D0Bf";
const RATE_SCALE = 10n ** 27n;

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

  // sLisUSD savings cost (LSR): the sLisUSD savings pool (LisUSDPoolSet) pays third-party
  // depositors the `duty` per-second rate, accrued synthetically through the getRate() index. That
  // interest is SupplySideRevenue and the protocol's Revenue is net of it (the treasury funds it
  // out of the lisUSD revenue already counted in Fees above). Measure the exact accrual over the
  // period — the interest the pool actually pays — rather than the treasury's lumpy top-up
  // transfers. NOTE: the EarnPool -> pool transfers are user deposits (USDT sold via PSM into
  // lisUSD, credited to the depositor via depositFor), i.e. principal, NOT cost — excluded.
  const [rateFrom, rateTo, poolSupply] = await Promise.all([
    options.fromApi.call({ target: LISUSD_POOL_SET, abi: "uint256:getRate" }),
    options.toApi.call({ target: LISUSD_POOL_SET, abi: "uint256:getRate" }),
    options.fromApi.call({ target: LISUSD_POOL_SET, abi: "uint256:totalSupply" }),
  ]);
  const savingsInterest =
    (BigInt(poolSupply) * (BigInt(rateTo) - BigInt(rateFrom))) / RATE_SCALE;

  const dailySupplySideRevenue = options.createBalances();
  if (savingsInterest > 0n) {
    dailySupplySideRevenue.add(lisUSD, savingsInterest, LSR_SAVINGS_COST);
  }

  // Revenue = collected income kept by the protocol, net of the savings interest paid to depositors.
  const dailyRevenue = dailyFees.clone();
  dailyRevenue.subtract(dailySupplySideRevenue, LSR_SAVINGS_COST);

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

const REVENUE_BREAKDOWN = {
  ...LISUSD_BREAKDOWN,
  [LSR_SAVINGS_COST]:
    'sLisUSD savings interest (duty rate accrual) paid to depositors, deducted from revenue.',
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
    Fees: 'All protocol income collected by Lista DAO on BSC (staking profits, borrow interest, liquidation profit, and PSM/veLista/LP/validator fees), net of frozen LISTA.',
    Revenue: 'Collected income kept by the protocol, net of the sLisUSD savings interest paid out to sLisUSD depositors.',
    ProtocolRevenue: 'Collected income kept by the protocol treasury, net of the sLisUSD savings interest.',
    SupplySideRevenue: 'Interest earned by third-party sLisUSD depositors in the savings pool (LisUSDPoolSet), measured as the duty-rate accrual over the period (totalSupply * change in getRate index).',
  },
  breakdownMethodology: {
    Fees: LISUSD_BREAKDOWN,
    Revenue: REVENUE_BREAKDOWN,
    ProtocolRevenue: REVENUE_BREAKDOWN,
    SupplySideRevenue: { [LSR_SAVINGS_COST]: 'Duty-rate interest accrued to sLisUSD depositors in LisUSDPoolSet over the period.' },
  }
};

export default adapter;
