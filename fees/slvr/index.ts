import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

// SLVR — 1-minute on-chain grid lottery on Robinhood Chain (Arbitrum Orbit L2, chainId 4663).
// Native wager token is ETH. Each resolved round takes a flat 10% rake on wagers: 8% is distributed
// to veNFT stakers (SlvrVoteEscrowStaking) and 2% goes to the jackpot (paid back out to players).
// Winners keep the other 90% (88% on current-generation games — see the buyback leg below). The
// SLVR token additionally taxes DEX trades (2% buy / 2% sell at launch, decrease-only:
// `buyTaxBps`/`sellTaxBps` on the token,
// https://robinhoodchain.blockscout.com/address/0x791229E3EbD6CFdC3D8157f48722684173C29aD9);
// collected tax is swapped to ETH and deposited into the jackpot.
//
// Game contracts hot-swap (the grid lottery has been redeployed several times), so wager events
// are read from every game in the on-chain SlvrGameRegistry rather than a hardcoded address.
// https://robinhoodchain.blockscout.com/address/0x3942CdA122eF303f47d4509A6Be57736E323cEE4
const GAME_REGISTRY = "0x3942CdA122eF303f47d4509A6Be57736E323cEE4";
// SlvrVoteEscrowStaking
// https://robinhoodchain.blockscout.com/address/0xaF68598eBd245DC3cB92FF16E9Ba1814DD137200
const VE_STAKING = "0xaF68598eBd245DC3cB92FF16E9Ba1814DD137200";
// https://robinhoodchain.blockscout.com/address/0x791229E3EbD6CFdC3D8157f48722684173C29aD9
const SLVR_TOKEN = "0x791229E3EbD6CFdC3D8157f48722684173C29aD9";
// liSLVR liquid-locker vault: its veNFT earns staker rewards, and the growth share of every
// harvest is used to buy SLVR that is permanently locked (buyback-and-lock).
// https://robinhoodchain.blockscout.com/address/0xb06a7A96d7fbfDCC64AeE0F0B185204b66E41b3B
const LISLVR_VAULT = "0xb06a7A96d7fbfDCC64AeE0F0B185204b66E41b3B";

const GAME_INFO_ABI = "function gameInfo(uint256) view returns ((address game, bytes32 gameType, uint8 status, uint8 tier, uint32 emissionWeight, uint16 maxWeightBps, bool exists))";
const BET_PLACED = "event BetPlaced(uint256 indexed roundId, address indexed beneficiary, uint256 total, uint8[] squares)";
const REWARD_DISTRIBUTED = "event RewardDistributed(uint256 amount)";
// Current-generation games take a 12% rake: 8% stakers + 2% jackpot + 2% buyback-and-burn
// (the buyback ETH buys SLVR that is sent to a graveyard address, out of circulation for good).
// Source: the active SlvrGridLottery, `protocolFeeBps = 1200` / `jackpotFeeBps = 200` /
// `buybackFeeBps = 200` (all owner-tunable, buyback capped at 400 bps):
// https://robinhoodchain.blockscout.com/address/0xa1e5213505772B195FD7AE3b4a6b27B58Cf72A3D
// BuybackFunded fires when accrued buyback ETH is actually flushed to the sink (every ~10 rounds,
// carrying over on failed sends), so summing event amounts tracks the real cash flow and stays
// correct across rate changes — the same flush-timed convention as the RewardDistributed-based
// staker figure, with at most a few minutes of skew at period boundaries. Deriving 2% of wagers
// instead would misprice periods after a rate change and count games without a buyback leg
// (older 10%-rake games never emit this event).
const BUYBACK_FUNDED = "event BuybackFunded(uint256 indexed roundId, uint256 amount)";
const ETH_DEPOSITED_TO_JACKPOT = "event EthDepositedToJackpot(uint256 amount)";
const HARVESTED = "event Harvested(uint256 grossEth, uint256 growthEth, uint256 incomeEth, uint256 protocolFee, uint256 keeperReward)";

const WAGERS = "Wagers"; // ETH wagered by players
const JACKPOT = "Jackpot"; // jackpotFeeBps cut of wagers routed to the jackpot pool
const DEX_TAX = "DEX trade tax"; // SLVR buy/sell tax, swapped to ETH and fed to the jackpot
const KEEPER = "Keeper rewards"; // gas compensation paid to liSLVR harvest callers
const PROTOCOL_FEE = "liSLVR protocol fee"; // vault harvest fee, 0 live (launched fee-off, max 10%)

const fetch = async (options: FetchOptions) => {
  // The registry is read at the latest block (it is append-only, and the RPC is not archival):
  // a game registered after the period simply has no logs inside it.
  const registryApi = new sdk.ChainApi({ chain: options.chain });
  const gameCount = await registryApi.call({ abi: "uint256:gameCount", target: GAME_REGISTRY });
  const gameCalls = [] as any[];
  for (let id = 1; id <= Number(gameCount); id++) gameCalls.push({ params: [id] });
  const games = (await registryApi.multiCall({ abi: GAME_INFO_ABI, target: GAME_REGISTRY, calls: gameCalls })).map((i: any) => i.game);
  // Per-game jackpot cut. Every generation so far runs `jackpotFeeBps = 200` and it has never
  // changed (zero FeeDistributionUpdated events across all history); games without the getter
  // default to 200. Read at latest like the registry — a mid-period rate change would emit
  // FeeDistributionUpdated and only skew the slices around it.
  const [jackpotRates, buybackRates] = await Promise.all([
    registryApi.multiCall({ abi: "uint16:jackpotFeeBps", calls: games, permitFailure: true }),
    // buybackFeeBps only exists on generations with the buyback-and-burn leg; older games can
    // never emit BuybackFunded, so they are excluded from that log query entirely.
    registryApi.multiCall({ abi: "uint16:buybackFeeBps", calls: games, permitFailure: true }),
  ]);
  const buybackGames = games.filter((_: string, i: number) => buybackRates[i] != null);

  const [betsPerGame, rewards, taxDeposits, harvests, roundBuybacks] = await Promise.all([
    options.getLogs({ targets: games, eventAbi: BET_PLACED, flatten: false }),
    options.getLogs({ target: VE_STAKING, eventAbi: REWARD_DISTRIBUTED }),
    options.getLogs({ target: SLVR_TOKEN, eventAbi: ETH_DEPOSITED_TO_JACKPOT }),
    options.getLogs({ target: LISLVR_VAULT, eventAbi: HARVESTED }),
    buybackGames.length ? options.getLogs({ targets: buybackGames, eventAbi: BUYBACK_FUNDED }) : Promise.resolve([]),
  ]);

  // Volume = total ETH wagered across every registered game this period. Jackpot = each game's
  // jackpotFeeBps cut of the wager, routed to the jackpot pool and paid back out to winning
  // players (supply-side).
  const dailyVolume = options.createBalances();
  const jackpot = options.createBalances();
  betsPerGame.forEach((logs: any[], i: number) => {
    // Every registered game exposes jackpotFeeBps and returns 200 (verified on-chain across all
    // six generations); the fallback covers a hypothetical getter-less generation, whose only
    // possible value is its deployed JACKPOT_FEE_BPS = 200 default.
    const bps = jackpotRates[i] == null ? 200n : BigInt(jackpotRates[i]);
    logs.forEach((log: any) => {
      dailyVolume.addGasToken(log.total, WAGERS);
      jackpot.addGasToken((BigInt(log.total) * bps) / 10000n, JACKPOT);
    });
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
  // keeperReward is the harvest caller's gas compensation (capped at 0.01 ETH per harvest) —
  // a supplier cost, not holder revenue. protocolFee is 0 live (the vault launched fee-off) but
  // is attributed to protocol revenue should it ever be switched on.
  let buybackTotal = 0n;
  let keeperTotal = 0n;
  let protocolFeeTotal = 0n;
  harvests.forEach((log: any) => {
    buybackTotal += BigInt(log.growthEth);
    keeperTotal += BigInt(log.keeperReward);
    protocolFeeTotal += BigInt(log.protocolFee);
  });
  if (buybackTotal > stakerRewardsTotal) buybackTotal = stakerRewardsTotal;
  if (keeperTotal > stakerRewardsTotal - buybackTotal) keeperTotal = stakerRewardsTotal - buybackTotal;
  if (protocolFeeTotal > stakerRewardsTotal - buybackTotal - keeperTotal) protocolFeeTotal = stakerRewardsTotal - buybackTotal - keeperTotal;

  // The 2% buyback-and-burn leg of the rake: ETH flushed to the buyback sink, which buys SLVR and
  // removes it from circulation. Additive protocol revenue accruing to holders via the burn.
  let roundBuybackTotal = 0n;
  roundBuybacks.forEach((log: any) => { roundBuybackTotal += BigInt(log.amount); });

  const dailyRevenue = options.createBalances();
  dailyRevenue.addGasToken(stakerRewardsTotal - keeperTotal, METRIC.STAKING_REWARDS);
  dailyRevenue.addGasToken(roundBuybackTotal, METRIC.TOKEN_BUY_BACK);

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addGasToken(protocolFeeTotal, PROTOCOL_FEE);

  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addGasToken(stakerRewardsTotal - buybackTotal - keeperTotal - protocolFeeTotal, METRIC.STAKING_REWARDS);
  dailyHoldersRevenue.addGasToken(buybackTotal + roundBuybackTotal, METRIC.TOKEN_BUY_BACK);

  // Fees = everything users paid the protocol: the full rake (8% stakers + 2% jackpot + 2%
  // buyback-and-burn on current games; older games had no buyback leg) plus the DEX trade tax.
  const dailyFees = options.createBalances();
  dailyFees.addGasToken(stakerRewardsTotal, METRIC.STAKING_REWARDS);
  dailyFees.addGasToken(roundBuybackTotal, METRIC.TOKEN_BUY_BACK);
  dailyFees.addBalances(jackpot);
  dailyFees.addBalances(dexTax);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(jackpot);
  dailySupplySideRevenue.addBalances(dexTax);
  dailySupplySideRevenue.addGasToken(keeperTotal, KEEPER);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Total ETH wagered across all lottery bets (BetPlaced events on every game in the SlvrGameRegistry).",
  Fees: "The rake taken from every round's wagers — 8% distributed to veNFT stakers, 2% routed to the jackpot, and on current games 2% to buyback-and-burn (BuybackFunded events; older games had a 10% rake with no buyback leg) — plus the SLVR DEX trade tax (2% buy/sell at launch, decrease-only), which is swapped to ETH and deposited into the jackpot.",
  Revenue: "Staker rewards (the ETH distributed to veNFT stakers, RewardDistributed events on SlvrVoteEscrowStaking) plus the buyback-and-burn cut of the rake, excluding keeper gas compensation.",
  ProtocolRevenue: "The liSLVR vault's harvest protocol fee (Harvested.protocolFee) — 0 since launch; the vault launched fee-off.",
  HoldersRevenue: "Staker rewards plus token buybacks: the 2% round buyback-and-burn (SLVR bought and removed from circulation) and the share of staker rewards the liSLVR vault harvests for its growth allocation (ETH that buys SLVR which is permanently locked). Keeper gas compensation is excluded.",
  SupplySideRevenue: "The jackpot cut of wagers plus the DEX trade tax deposited into the jackpot (both paid back out to winning players), and gas compensation paid to liSLVR harvest keepers.",
};

const breakdownMethodology = {
  Volume: {
    [WAGERS]: "ETH wagered across the grid each round (BetPlaced events on every registered game).",
  },
  Fees: {
    [METRIC.STAKING_REWARDS]: "8% of wagers distributed to veNFT stakers (RewardDistributed events).",
    [JACKPOT]: "2% of wagers routed to the jackpot pool.",
    [METRIC.TOKEN_BUY_BACK]: "2% of wagers routed to buyback-and-burn on current games (BuybackFunded events): ETH buys SLVR that is removed from circulation.",
    [DEX_TAX]: "SLVR buy/sell DEX tax, swapped to ETH and deposited into the jackpot (EthDepositedToJackpot events).",
  },
  Revenue: {
    [METRIC.STAKING_REWARDS]: "8% of wagers distributed to veNFT stakers.",
    [METRIC.TOKEN_BUY_BACK]: "2% of wagers routed to buyback-and-burn.",
  },
  ProtocolRevenue: {
    [PROTOCOL_FEE]: "The liSLVR vault's harvest protocol fee (Harvested.protocolFee), 0 since launch.",
  },
  HoldersRevenue: {
    [METRIC.STAKING_REWARDS]: "Staker rewards distributed to veNFT stakers, excluding the slice the liSLVR vault redeploys into buybacks, keeper gas compensation and the (currently zero) vault protocol fee.",
    [METRIC.TOKEN_BUY_BACK]: "The 2% round buyback-and-burn (BuybackFunded events) plus the growth share of liSLVR vault harvests (Harvested events): ETH used to buy SLVR that is burned or permanently locked.",
  },
  SupplySideRevenue: {
    [JACKPOT]: "2% of wagers routed to the jackpot pool, paid back out to winning players.",
    [DEX_TAX]: "SLVR buy/sell DEX tax deposited into the jackpot, paid back out to winning players.",
    [KEEPER]: "Gas compensation paid to liSLVR harvest callers (Harvested.keeperReward, capped at 0.01 ETH per harvest).",
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
