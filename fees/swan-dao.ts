import { ChainApi } from "@defillama/sdk";
import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Swan DAO (https://www.swanusd.com) is the CoinDAO of SwanUSD, a stablecoin market deployed by the
// Monolith factory (https://docs.monolith.market). The market's Lender holds the wstETH collateral, mints
// SwanUSD and is also the PSM: users mint SwanUSD 1:1 with USDS, which the Lender deposits into sUSDS.
// Source (Sourcify exact match): https://github.com/MonolithMarket/Monolith/blob/dev/src/Lender.sol
// - accrueInterest() splits the interest of non-redeemable borrowers into a local reserve fee (feeBps,
//   50% since launch), a Monolith fee (factory.getFeeOf, 0% so far) and the rest, minted to sSwanUSD
//   stakers; when less SwanUSD is staked than the paid debt, the surplus also goes to local reserves.
// - pullLocalReserves() adds the sUSDS yield above the USDS owed to SwanUSD sellers (accruePsmProfit) to
//   local reserves and mints them to the RevenueRouter, which sends govStakingBps of them to SWAN stakers
//   (sSWAN, 0xcBC108384e874D9B0436adE3918685BaA709e48c) and the rest to the DAO treasury.
const LENDER = '0x4ed5c72816aBc1b67ac31DdAbE31cff4a8c56a15';
const LENDER_DEPLOY_BLOCK = 26249209; // tx 0xfc70d106fba81de4179012dbc0497cb77301b8e5bfdf6217e0bcce6bae05274b
const SWANUSD = '0x9BF2B2F57A2968A0E81546Ed50cBbbb7C9d6e05E'; // Lender.coin()
const SSWANUSD = '0xfa80c7349cC2357C42A64C2954B24B1a61C29435'; // Lender.vault()
const SUSDS = ADDRESSES.ethereum.sUSDS; // Lender.psmVault()
// Lender.operator(); RevenueRouter has no call to hand the operator role over.
const REVENUE_ROUTER = '0xf69f74148687ca4860544f865581F05cA3f9098c';

// SwanUSD amounts are counted as USDS: the PSM mints SwanUSD 1:1 for USDS (Lender.buy) and redeems it
// 1:1 into USDS with no fee (Lender.sell), and DefiLlama has no SwanUSD price before 2026-10-29.
// USDS and SwanUSD both have 18 decimals, so the Lender's PSM amounts need no scaling.
const USDS = ADDRESSES.ethereum.USDS; // Lender.psmAsset()

const EVENTS = {
  interestAccrued: 'event InterestAccrued(uint256 interestAccrued, uint256 newBorrowRateMantissa)',
  accruedLocalReserves: 'event AccruedLocalReserves(uint256 amount)',
  accruedGlobalReserves: 'event AccruedGlobalReserves(uint256 amount)',
  redeemed: 'event Redeemed(address indexed account, address indexed borrower, uint256 amountIn, uint256 amountOut)',
  bought: 'event Bought(address indexed account, uint256 assetIn, uint256 coinOut)',
  transfer: 'event Transfer(address indexed from, address indexed to, uint256 amount)',
};

const LABELS = {
  PSM_YIELD: 'PSM sUSDS Yield',
  PSM_MINT_FEES: 'PSM Mint Fees',
  REDEMPTION_FEES: 'Redemption Fees',
  INTEREST_TO_STAKERS: 'Borrow Interest To sSwanUSD Stakers',
  INTEREST_TO_MONOLITH: 'Borrow Interest To Monolith',
  REDEMPTION_FEES_TO_BORROWERS: 'Redemption Fees To Borrowers',
  INTEREST_TO_DAO: 'Borrow Interest To Swan DAO',
  PSM_YIELD_TO_DAO: 'PSM sUSDS Yield To Swan DAO',
  PSM_MINT_FEES_TO_DAO: 'PSM Mint Fees To Swan DAO',
  REVENUE_TO_SWAN_STAKERS: 'Swan DAO Revenue To SWAN Stakers',
  REVENUE_TO_TREASURY: 'Swan DAO Revenue To Treasury',
};

// sUSDS conversions round by a wei per PSM trade, so the PSM yield of a near-empty PSM can come out a few
// wei below zero; a shortfall above 0.000001 USDS means the accounting is off.
const ROUNDING_DUST = 10n ** 12n;

const sum = (logs: any[], field: string): bigint => logs.reduce((total: bigint, log) => total + BigInt(log[field]), 0n);

// Lender reserves at a block: local reserves (Swan DAO), global reserves (Monolith), and the sUSDS yield on
// the PSM reserves not yet added to local reserves (sUSDS value above the USDS owed to SwanUSD sellers).
async function getReserves(api: ChainApi) {
  const [localReserves, globalReserves, psmLiabilities, psmShares] = await api.batchCall([
    { target: LENDER, abi: 'function accruedLocalReserves() view returns (uint120)' },
    { target: LENDER, abi: 'function accruedGlobalReserves() view returns (uint120)' },
    { target: LENDER, abi: 'uint256:freePsmAssets' },
    { target: SUSDS, abi: 'erc20:balanceOf', params: [LENDER] },
  ]);
  const psmAssets = await api.call({ target: SUSDS, abi: 'function previewRedeem(uint256 shares) view returns (uint256)', params: [psmShares] });
  return {
    localReserves: BigInt(localReserves),
    globalReserves: BigInt(globalReserves),
    unrealizedPsmYield: BigInt(psmAssets) - BigInt(psmLiabilities),
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  // The first hours of 2026-10-22 are before the market existed: nothing accrued, every metric is zero.
  if (toBlock < LENDER_DEPLOY_BLOCK)
    return { dailyFees, dailyUserFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue: options.createBalances(), dailyProtocolRevenue: options.createBalances() };

  // Each window starts one block after the previous one ends, so the opening state is read at fromBlock - 1
  // (logs cover fromBlock..toBlock); otherwise the changes in fromBlock fall between windows.
  const openingApi = new ChainApi({ chain: options.chain, block: Math.max(fromBlock - 1, LENDER_DEPLOY_BLOCK) });

  const [interestLogs, localReservePulls, globalReservePulls, redemptions, swanUsdTransfers, opening, closing, [redeemFeeBps, buyFeeBps, govStakingBps]] = await Promise.all([
    options.getLogs({ target: LENDER, eventAbi: EVENTS.interestAccrued }),
    options.getLogs({ target: LENDER, eventAbi: EVENTS.accruedLocalReserves }),
    options.getLogs({ target: LENDER, eventAbi: EVENTS.accruedGlobalReserves }),
    options.getLogs({ target: LENDER, eventAbi: EVENTS.redeemed }),
    options.getLogs({ target: SWANUSD, eventAbi: EVENTS.transfer }),
    getReserves(openingApi),
    getReserves(options.toApi),
    openingApi.batchCall([
      { target: LENDER, abi: 'uint16:redeemFeeBps' },
      { target: LENDER, abi: 'uint256:getBuyFeeBps' },
      { target: REVENUE_ROUTER, abi: 'uint16:govStakingBps' },
    ]),
  ]);

  // Borrow interest: InterestAccrued has the total. accrueInterest() is the only place that mints SwanUSD to
  // sSwanUSD, once per accrual (even when the stakers' share is 0), and the Monolith share accrues to the
  // global reserves the factory pulls.
  const vaultMints = swanUsdTransfers.filter(t =>
    t.from.toLowerCase() === ADDRESSES.null && t.to.toLowerCase() === SSWANUSD.toLowerCase());
  if (vaultMints.length !== interestLogs.length)
    throw new Error(`swan-dao: ${interestLogs.length} interest accruals but ${vaultMints.length} sSwanUSD mints, logs are incomplete`);
  const interest = sum(interestLogs, 'interestAccrued');
  const interestToStakers = sum(vaultMints, 'amount');
  const interestToMonolith = sum(globalReservePulls, 'amount') + closing.globalReserves - opening.globalReserves;
  const interestToDao = interest - interestToStakers - interestToMonolith;

  // The PSM mint fee ramps from 0% to 1% over the second half of the immutability period (from 2028-10-22);
  // Bought.coinOut is net of it, so fee = coinOut * bps / (10000 - bps).
  let psmMintFees = 0n;
  if (Number(buyFeeBps) > 0) {
    const buys = await options.getLogs({ target: LENDER, eventAbi: EVENTS.bought });
    psmMintFees = sum(buys, 'coinOut') * BigInt(buyFeeBps) / (10000n - BigInt(buyFeeBps));
  }

  // Swan DAO revenue is what accrued to local reserves in the window (pulled, plus the change in accrued and in
  // unrealized sUSDS yield): its interest share, PSM mint fees and the sUSDS yield on the PSM reserves.
  const daoRevenue = sum(localReservePulls, 'amount') + closing.localReserves - opening.localReserves
    + closing.unrealizedPsmYield - opening.unrealizedPsmYield;
  let psmYield = daoRevenue - interestToDao - psmMintFees;
  if (interestToDao < 0n || psmYield < -ROUNDING_DUST)
    throw new Error(`swan-dao: reserves do not add up (interest to DAO ${interestToDao}, PSM yield ${psmYield})`);
  if (psmYield < 0n) psmYield = 0n;

  // Redeemers get collateral worth amountIn minus redeemFeeBps (1.75% since launch); the redeemed borrower keeps the fee.
  const redemptionFees = sum(redemptions, 'amountIn') * BigInt(redeemFeeBps) / 10000n;

  dailyFees.add(USDS, interest, METRIC.BORROW_INTEREST);
  dailyFees.add(USDS, psmYield, LABELS.PSM_YIELD);
  dailyFees.add(USDS, psmMintFees, LABELS.PSM_MINT_FEES);
  dailyFees.add(USDS, redemptionFees, LABELS.REDEMPTION_FEES);

  // User fees are the fees SwanUSD users pay. The sUSDS yield on the PSM reserves is paid by Sky (Sky Savings
  // Rate), not by SwanUSD users, so it is left out here but stays in fees, revenue and holders revenue.
  dailyUserFees.add(USDS, interest, METRIC.BORROW_INTEREST);
  dailyUserFees.add(USDS, psmMintFees, LABELS.PSM_MINT_FEES);
  dailyUserFees.add(USDS, redemptionFees, LABELS.REDEMPTION_FEES);

  dailySupplySideRevenue.add(USDS, interestToStakers, LABELS.INTEREST_TO_STAKERS);
  dailySupplySideRevenue.add(USDS, interestToMonolith, LABELS.INTEREST_TO_MONOLITH);
  dailySupplySideRevenue.add(USDS, redemptionFees, LABELS.REDEMPTION_FEES_TO_BORROWERS);

  dailyRevenue.add(USDS, interestToDao, LABELS.INTEREST_TO_DAO);
  dailyRevenue.add(USDS, psmYield, LABELS.PSM_YIELD_TO_DAO);
  dailyRevenue.add(USDS, psmMintFees, LABELS.PSM_MINT_FEES_TO_DAO);

  // RevenueRouter.govStakingBps: share of the DAO revenue sent to SWAN stakers (100% since launch).
  const stakersShare = Number(govStakingBps) / 10000;

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: dailyRevenue.clone(stakersShare, LABELS.REVENUE_TO_SWAN_STAKERS),
    dailyProtocolRevenue: dailyRevenue.clone(1 - stakersShare, LABELS.REVENUE_TO_TREASURY),
  };
};

const methodology = {
  Fees: 'Interest paid by SwanUSD borrowers who opt out of redemptions, sUSDS yield earned on the USDS reserves of the SwanUSD PSM, PSM mint fees and the redemption fees redeemers pay to borrowers. Excludes liquidation incentives paid to liquidators and SWAN emissions.',
  UserFees: 'Interest paid by SwanUSD borrowers who opt out of redemptions, PSM mint fees and the redemption fees redeemers pay to borrowers. Excludes the sUSDS yield on the PSM reserves, which is paid by Sky rather than by SwanUSD users, and liquidation incentives paid to liquidators.',
  Revenue: 'Swan DAO\'s share of borrow interest (the market\'s local reserve fee, 50% since launch, plus any interest above what sSwanUSD stakers can receive), all sUSDS yield on the PSM reserves and all PSM mint fees.',
  SupplySideRevenue: 'Borrow interest paid to sSwanUSD stakers, the Monolith protocol fee on borrow interest (0% so far), and redemption fees kept by the borrowers whose collateral is redeemed.',
  HoldersRevenue: 'Swan DAO revenue distributed to SWAN stakers (sSWAN) by the RevenueRouter, 100% of it since launch.',
  ProtocolRevenue: 'Swan DAO revenue sent to the DAO treasury instead of SWAN stakers, 0% of it since launch.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest paid by SwanUSD borrowers who opt out of redemptions (paid debt).',
    [LABELS.PSM_YIELD]: 'Yield earned by the PSM USDS reserves deposited in sUSDS.',
    [LABELS.PSM_MINT_FEES]: 'Fee on minting SwanUSD with USDS through the PSM, ramping from 0% to 1% over the second half of the immutability period (from 2028-10-22).',
    [LABELS.REDEMPTION_FEES]: 'Fee paid by redeemers when they swap SwanUSD for the collateral of redeemable borrowers (1.75% since launch).',
  },
  UserFees: {
    [METRIC.BORROW_INTEREST]: 'Interest paid by SwanUSD borrowers who opt out of redemptions (paid debt).',
    [LABELS.PSM_MINT_FEES]: 'Fee paid by users minting SwanUSD with USDS through the PSM, ramping from 0% to 1% over the second half of the immutability period (from 2028-10-22).',
    [LABELS.REDEMPTION_FEES]: 'Fee paid by redeemers when they swap SwanUSD for the collateral of redeemable borrowers (1.75% since launch).',
  },
  SupplySideRevenue: {
    [LABELS.INTEREST_TO_STAKERS]: 'Borrow interest after the market and Monolith fees, paid to sSwanUSD stakers.',
    [LABELS.INTEREST_TO_MONOLITH]: 'Monolith protocol fee on borrow interest, set by the Monolith factory (0% so far, 10% max).',
    [LABELS.REDEMPTION_FEES_TO_BORROWERS]: 'Redemption fees kept as collateral by the redeemed borrowers.',
  },
  Revenue: {
    [LABELS.INTEREST_TO_DAO]: 'Local reserve fee on borrow interest (50% since launch), plus any interest above what sSwanUSD stakers can receive.',
    [LABELS.PSM_YIELD_TO_DAO]: 'All sUSDS yield on the PSM reserves.',
    [LABELS.PSM_MINT_FEES_TO_DAO]: 'All PSM mint fees.',
  },
  HoldersRevenue: {
    [LABELS.REVENUE_TO_SWAN_STAKERS]: 'Share of Swan DAO revenue distributed to SWAN stakers (sSWAN), 100% since launch.',
  },
  ProtocolRevenue: {
    [LABELS.REVENUE_TO_TREASURY]: 'Share of Swan DAO revenue sent to the DAO treasury, 0% since launch.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2026-10-22',
  methodology,
  breakdownMethodology,
};

export default adapter;
