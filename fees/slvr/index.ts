import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

// SLVR — 1-minute on-chain grid lottery on Robinhood Chain (Arbitrum Orbit L2, chainId 4663).
// Native wager token is ETH. Each resolved round takes a flat 10% rake on wagers: 8% is distributed
// to veNFT stakers (SlvrVoteEscrowStaking) and 2% goes to the jackpot (paid back out to players).
// Winners keep the other 90%. The SLVR token additionally taxes DEX trades (2% buy / 2% sell at
// launch, decrease-only); collected tax is swapped to ETH and deposited into the jackpot.
//
// Game contracts hot-swap (the grid lottery has been redeployed several times), so wager events
// are read from every game in the on-chain SlvrGameRegistry rather than a hardcoded address.
const GAME_REGISTRY = "0x3942CdA122eF303f47d4509A6Be57736E323cEE4";
const VE_STAKING = "0xaF68598eBd245DC3cB92FF16E9Ba1814DD137200"; // SlvrVoteEscrowStaking
const SLVR_TOKEN = "0x791229E3EbD6CFdC3D8157f48722684173C29aD9";
// liSLVR liquid-locker vault: its veNFT earns staker rewards, and the growth share of every
// harvest is used to buy SLVR that is permanently locked (buyback-and-lock).
const LISLVR_VAULT = "0xb06a7A96d7fbfDCC64AeE0F0B185204b66E41b3B";

const GAME_INFO_ABI = "function gameInfo(uint256) view returns ((address game, bytes32 gameType, uint8 status, uint8 tier, uint32 emissionWeight, uint16 maxWeightBps, bool exists))";
const BET_PLACED = "event BetPlaced(uint256 indexed roundId, address indexed beneficiary, uint256 total, uint8[] squares)";
const REWARD_DISTRIBUTED = "event RewardDistributed(uint256 amount)";
const ETH_DEPOSITED_TO_JACKPOT = "event EthDepositedToJackpot(uint256 amount)";
const HARVESTED = "event Harvested(uint256 grossEth, uint256 growthEth, uint256 incomeEth, uint256 protocolFee, uint256 keeperReward)";

const WAGERS = "Wagers"; // ETH wagered by players
const JACKPOT = "Jackpot"; // 2% of wagers routed to the jackpot pool
const DEX_TAX = "DEX trade tax"; // SLVR buy/sell tax, swapped to ETH and fed to the jackpot

const fetch = async (options: FetchOptions) => {
  // The registry is read at the latest block (it is append-only, and the RPC is not archival):
  // a game registered after the period simply has no logs inside it.
  const registryApi = new sdk.ChainApi({ chain: options.chain });
  const gameCount = await registryApi.call({ abi: "uint256:gameCount", target: GAME_REGISTRY });
  const gameCalls = [] as any[];
  for (let id = 1; id <= Number(gameCount); id++) gameCalls.push({ params: [id] });
  const games = (await registryApi.multiCall({ abi: GAME_INFO_ABI, target: GAME_REGISTRY, calls: gameCalls })).map((i: any) => i.game);

  const [bets, rewards, taxDeposits, harvests] = await Promise.all([
    options.getLogs({ targets: games, eventAbi: BET_PLACED }),
    options.getLogs({ target: VE_STAKING, eventAbi: REWARD_DISTRIBUTED }),
    options.getLogs({ target: SLVR_TOKEN, eventAbi: ETH_DEPOSITED_TO_JACKPOT }),
    options.getLogs({ target: LISLVR_VAULT, eventAbi: HARVESTED }),
  ]);

  // Volume = total ETH wagered across every registered game this period. Jackpot = 2% of each
  // wager, routed to the jackpot pool and paid back out to winning players (supply-side).
  const dailyVolume = options.createBalances();
  const jackpot = options.createBalances();
  bets.forEach((log: any) => {
    dailyVolume.addGasToken(log.total, WAGERS);
    jackpot.addGasToken((BigInt(log.total) * 2n) / 100n, JACKPOT);
  });

  // DEX trade tax: the SLVR token swaps collected buy/sell tax to ETH and deposits it into the
  // jackpot (EthDepositedToJackpot). Paid by traders, returned to players — supply-side.
  const dexTax = options.createBalances();
  taxDeposits.forEach((log: any) => dexTax.addGasToken(log.amount, DEX_TAX));

  // Revenue = all staker rewards, taken straight from the ETH actually distributed to veNFT
  // stakers (RewardDistributed events on SlvrVoteEscrowStaking) — the real 8% cut of every round.
  let stakerRewardsTotal = 0n;
  rewards.forEach((log: any) => { stakerRewardsTotal += BigInt(log.amount); });

  // Buybacks: the growth share of liSLVR vault harvests buys SLVR that is permanently locked.
  // That ETH is part of the staker rewards already counted above (the vault's veNFT earned it),
  // so it is split out of the staking-rewards component rather than added on top. Harvests batch
  // accrued rewards, so the buyback slice is capped at the period's distributed rewards.
  let buybackTotal = 0n;
  harvests.forEach((log: any) => { buybackTotal += BigInt(log.growthEth); });
  if (buybackTotal > stakerRewardsTotal) buybackTotal = stakerRewardsTotal;

  const dailyRevenue = options.createBalances();
  dailyRevenue.addGasToken(stakerRewardsTotal, METRIC.STAKING_REWARDS);

  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addGasToken(stakerRewardsTotal - buybackTotal, METRIC.STAKING_REWARDS);
  dailyHoldersRevenue.addGasToken(buybackTotal, METRIC.TOKEN_BUY_BACK);

  // Fees = everything users paid the protocol: the full 10% rake (8% stakers + 2% jackpot) plus
  // the DEX trade tax.
  const dailyFees = options.createBalances();
  dailyFees.addGasToken(stakerRewardsTotal, METRIC.STAKING_REWARDS);
  dailyFees.addBalances(jackpot);
  dailyFees.addBalances(dexTax);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(jackpot);
  dailySupplySideRevenue.addBalances(dexTax);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Total ETH wagered across all lottery bets (BetPlaced events on every game in the SlvrGameRegistry).",
  Fees: "The 10% rake taken from every round's wagers (8% distributed to veNFT stakers plus 2% routed to the jackpot) plus the SLVR DEX trade tax (2% buy/sell at launch, decrease-only), which is swapped to ETH and deposited into the jackpot.",
  Revenue: "All staker rewards — the ETH distributed to veNFT stakers (RewardDistributed events on SlvrVoteEscrowStaking).",
  HoldersRevenue: "All staker rewards — the ETH distributed to veNFT stakers. The share the liSLVR vault harvests for its growth allocation is broken out as token buybacks: that ETH buys SLVR which is permanently locked.",
  SupplySideRevenue: "The 2% of wagers routed to the jackpot pool plus the DEX trade tax deposited into the jackpot, both paid back out to winning players.",
};

const breakdownMethodology = {
  Volume: {
    [WAGERS]: "ETH wagered across the grid each round (BetPlaced events on every registered game).",
  },
  Fees: {
    [METRIC.STAKING_REWARDS]: "8% of wagers distributed to veNFT stakers (RewardDistributed events).",
    [JACKPOT]: "2% of wagers routed to the jackpot pool.",
    [DEX_TAX]: "SLVR buy/sell DEX tax, swapped to ETH and deposited into the jackpot (EthDepositedToJackpot events).",
  },
  Revenue: {
    [METRIC.STAKING_REWARDS]: "8% of wagers distributed to veNFT stakers.",
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "Staker rewards distributed to veNFT stakers, excluding the slice the liSLVR vault redeploys into buybacks.",
    [METRIC.TOKEN_BUY_BACK]: "The growth share of liSLVR vault harvests (Harvested events): ETH used to buy SLVR that is permanently locked.",
  },
  SupplySideRevenue: {
    [JACKPOT]: "2% of wagers routed to the jackpot pool, paid back out to winning players.",
    [DEX_TAX]: "SLVR buy/sell DEX tax deposited into the jackpot, paid back out to winning players.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-09",
  methodology,
  breakdownMethodology,
};

export default adapter;
