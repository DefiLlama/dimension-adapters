import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Gas ($GAS, https://www.gas.cash) is a game on Robinhood Chain. $GAS trades against the USO Stock Token in a
// Doppler-launched Uniswap v4 pool. The pool's fees (a swap tax taken by the Doppler Rehype hook, plus a share of
// the 0.1% LP fee) are collected by GasFeeReceiver and forwarded on. Players buy NFT cars in $GAS and repair them
// in USO; eligible players claim USO from the prize pool by visiting a real gas station.

// GasFeeReceiver: receives 95% of the pool's LP fees and 95% of the swap tax (the other 5% of each goes to
// Doppler and is not counted here). `forward` sends its whole balance to one wallet: `earlyVault` during the
// 15-minute launch tax decay, `vault` afterwards. Deployed in block 70061809.
// https://robinhoodchain.blockscout.com/tx/0x063f4f939af3c642482cd4632366ab80b3e7224948871d416e38234b2d8447a2
// Caveats, none of which has happened so far:
// - The owner's `sweep()` on the receiver or the splitter emits Swept, not Forwarded, so a swept balance is not
//   counted.
// - `moveBeneficiary` would move the LP-fee share away from the receiver. If it is ever called, this adapter must
//   be updated the same day.
// - Tokens sent straight to the receiver by anyone are forwarded like fees and would be counted as fees.
const FEE_RECEIVER = "0xBD667002518067B8FF181a3E6BF8fE365F67E9A2";
// GasFeeSplitter: the receiver's `vault` since setVault in block 70284044
// (https://robinhoodchain.blockscout.com/tx/0x03d285410dbbdaf4321932eab6f82fc6f2cf42318691987ddce2aed7bb0864c0).
// Splits every forward across its legs: 7500 bps prize pool, 2500 bps buybacks (legs(0), legs(1) on chain).
// https://robinhoodchain.blockscout.com/tx/0x18cffd3837a4a0482fd459d52b5fc9cf298d70fedb8f79bd4ad2ef639f2f1d5c
const FEE_SPLITTER = "0x5DbDBfa1D0AbA8755a4c08E9FCDDB0b5d2CAbfB0";
// Gas721 (UUPS proxy): the NFT car collection. Emits Bought (paid in $GAS) and Repaired (paid in USO).
// https://robinhoodchain.blockscout.com/tx/0x723a9cd81bc2f2ccd0481c1a2fbe5e4580b2aaaae99033fc516b256020149f41
const GAS721 = "0x4815ce655aC4F32b0DeF08A26D8181D4c338bA90";

// Destination wallets (EOAs), each read on chain: GasFeeReceiver.earlyVault(), GasFeeSplitter.legs(0|1),
// Gas721.buybacks().
// Team wallet that took the receiver's forwards during the launch tax decay (decayEnd() = 2026-09-23 00:42:29 UTC):
// 931.16 USO of launch sniper tax in blocks 70084575-70092855. Deliberately not counted.
const EARLY_VAULT = "0x8A890f77Beee8438908a2A790058e7AC39605b87";
// Prize pool: pays players their USO claims. It was the receiver's `vault` until the splitter was wired in. The
// team sells the $GAS it receives into USO by hand (e.g. tx 0x1126a3b4172f23678c0a7123bece4921f9a7fe1e027ee250b2c4be74571cba89).
const PRIZE_POOL = "0xdE597816a8473C059C846B77EE4ABaC8EbaB1770";
// Buybacks wallet: takes the splitter's 25% leg and the buyback share of every car sale. Buybacks are made by
// hand; none had been made as of 2026-09-24 (the wallet had never sent a transaction).
const BUYBACKS = "0x18eD3E25Fb4786EA60021E2e9A2Da0A52602f503";

// $GAS (Gas721.paymentToken()). No DefiLlama price yet, so $GAS amounts value at $0 until it is listed.
const GAS = "0x28dA843C0223990Fb57701319B30804b89eFF111";
// USO Stock Token (Gas721.repairToken()), the pool's other side and what the prize pool pays out.
const USO = "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344";

// Until this block the buyback share of a car sale (80%, Gas721.buybackBps() = 8000) was burned (sent to the zero
// address). From it on, the same share goes to the buybacks wallet. Upgrade tx:
// https://robinhoodchain.blockscout.com/tx/0x660c62f925a040ff8cbda516a3dd8cf1ed33c2e0eb80640ca9746fe2fe911724
const BUYBACKS_UPGRADE_BLOCK = 70282128;

const EVENTS = {
  // GasFeeReceiver: `to` is the vault picked by the clock. GasFeeSplitter: `to` is one leg.
  Forwarded: "event Forwarded(address indexed token, address indexed to, uint256 amount)",
  Bought: "event Bought(uint256 indexed tokenId, address indexed buyer, uint8 tier, uint256 cost, uint256 toBuybacks, uint256 toTreasury)",
  Repaired: "event Repaired(uint256 indexed tokenId, address indexed payer, uint256 cost)",
};

const LABELS = {
  PoolFees: "GAS/USO Pool Fees",
  PoolFeesToPrizePool: "GAS/USO Pool Fees To Prize Pool",
  PoolFeesToBuybacks: "GAS/USO Pool Fees To Buybacks",
  CarSales: "NFT Car Sales",
  CarSalesToTreasury: "NFT Car Sales To Treasury",
  CarSalesToBuybacks: "NFT Car Sales To Buybacks",
  CarSalesBurned: "NFT Car Sales Burned",
  CarRepairs: "NFT Car Repairs",
  CarRepairsToTreasury: "NFT Car Repairs To Treasury",
  TokenBurn: "Token Burn",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [[receiverForwards, splitterForwards], bought, repaired] = await Promise.all([
    options.getLogs({ targets: [FEE_RECEIVER, FEE_SPLITTER], eventAbi: EVENTS.Forwarded, flatten: false }),
    options.getLogs({ target: GAS721, eventAbi: EVENTS.Bought, onlyArgs: false }),
    options.getLogs({ target: GAS721, eventAbi: EVENTS.Repaired }),
  ]);

  // Pool fees are counted once, where they leave our contracts for a final wallet: the receiver's forwards straight
  // to the prize pool (before the splitter existed) and the splitter's forwards to its legs.
  const addPoolFee = (token: string, amount: bigint, to: string) => {
    if (to === PRIZE_POOL.toLowerCase()) {
      dailyFees.add(token, amount, LABELS.PoolFees);
      dailySupplySideRevenue.add(token, amount, LABELS.PoolFeesToPrizePool);
    } else if (to === BUYBACKS.toLowerCase()) {
      dailyFees.add(token, amount, LABELS.PoolFees);
      dailyRevenue.add(token, amount, LABELS.PoolFeesToBuybacks);
      dailyHoldersRevenue.add(token, amount, METRIC.TOKEN_BUY_BACK);
    } else {
      // A new vault or splitter leg must be classified before it is counted.
      throw new Error(`gas-cash: unknown fee destination ${to}`);
    }
  };
  for (const log of receiverForwards) {
    const to = String(log.to).toLowerCase();
    // Skipped: the splitter's own forwards count this money when it pays its legs.
    if (to === FEE_SPLITTER.toLowerCase()) continue;
    // Skipped on purpose: the launch sniper tax forwarded to the team wallet during the 15-minute tax decay.
    if (to === EARLY_VAULT.toLowerCase()) continue;
    addPoolFee(log.token, BigInt(log.amount), to);
  }
  for (const log of splitterForwards) {
    addPoolFee(log.token, BigInt(log.amount), String(log.to).toLowerCase());
  }

  // Car sales, paid in $GAS: the whole price is revenue. The buyback share was burned before the upgrade block and
  // goes to the buybacks wallet from it on; the rest goes to the treasury.
  for (const log of bought) {
    const { cost, toBuybacks, toTreasury } = log.args;
    dailyFees.add(GAS, cost, LABELS.CarSales);
    dailyRevenue.add(GAS, toTreasury, LABELS.CarSalesToTreasury);
    dailyProtocolRevenue.add(GAS, toTreasury, LABELS.CarSalesToTreasury);
    if (Number(log.blockNumber) < BUYBACKS_UPGRADE_BLOCK) {
      dailyRevenue.add(GAS, toBuybacks, LABELS.CarSalesBurned);
      dailyHoldersRevenue.add(GAS, toBuybacks, LABELS.TokenBurn);
    } else {
      dailyRevenue.add(GAS, toBuybacks, LABELS.CarSalesToBuybacks);
      dailyHoldersRevenue.add(GAS, toBuybacks, METRIC.TOKEN_BUY_BACK);
    }
  }

  // Car repairs, paid in USO (Gas721.repairToken()): all of it goes to the treasury.
  for (const log of repaired) {
    dailyFees.add(USO, log.cost, LABELS.CarRepairs);
    dailyRevenue.add(USO, log.cost, LABELS.CarRepairsToTreasury);
    dailyProtocolRevenue.add(USO, log.cost, LABELS.CarRepairsToTreasury);
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "Fees from the GAS/USO pool that reach Gas (95% of the swap tax and of the LP fee; Doppler keeps the other 5%), plus what players pay to buy NFT cars (in $GAS) and to repair them (in USO). The 15-minute launch sniper tax on 2026-09-23 (forwarded to a team wallet during the launch tax decay) is not counted.",
  Revenue: "All car sales and repairs, plus the 25% of pool fees sent to the buybacks wallet.",
  SupplySideRevenue: "Pool fees sent to the prize pool, which pays players in USO when they claim at gas stations (75% of pool fees since 2026-09-23 06:03 UTC, all of them before). The team sells the prize pool's $GAS into USO by hand.",
  ProtocolRevenue: "The treasury's 20% of car sales and all car repairs.",
  HoldersRevenue: "Pool fees and car-sale shares sent to the buybacks wallet 0x18eD3E25Fb4786EA60021E2e9A2Da0A52602f503: 25% of pool fees, and 80% of car sales since 2026-09-23 05:59 UTC (paid in $GAS and held in that wallet). Buybacks are made by hand when the team decides and have not started yet. Before 2026-09-23 05:59 UTC the 80% car-sale share was burned.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.PoolFees]: "Swap tax and LP fees from the GAS/USO Uniswap v4 pool, in USO and $GAS, counted when forwarded to the prize pool or the buybacks wallet. The launch sniper tax is not counted.",
    [LABELS.CarSales]: "$GAS paid by players to buy NFT cars.",
    [LABELS.CarRepairs]: "USO paid by players to repair NFT cars.",
  },
  Revenue: {
    [LABELS.PoolFeesToBuybacks]: "25% of pool fees sent to the buybacks wallet.",
    [LABELS.CarSalesToTreasury]: "20% of car sales sent to the treasury.",
    [LABELS.CarSalesToBuybacks]: "80% of car sales sent to the buybacks wallet in $GAS, since 2026-09-23 05:59 UTC.",
    [LABELS.CarSalesBurned]: "80% of car sales burned, until 2026-09-23 05:59 UTC.",
    [LABELS.CarRepairsToTreasury]: "Car repairs, all sent to the treasury.",
  },
  SupplySideRevenue: {
    [LABELS.PoolFeesToPrizePool]: "Pool fees sent to the prize pool, which pays players in USO; its $GAS is sold into USO by hand.",
  },
  ProtocolRevenue: {
    [LABELS.CarSalesToTreasury]: "20% of car sales sent to the treasury.",
    [LABELS.CarRepairsToTreasury]: "Car repairs, all sent to the treasury.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "25% of pool fees and, since 2026-09-23 05:59 UTC, 80% of car sales, sent to the buybacks wallet 0x18eD3E25Fb4786EA60021E2e9A2Da0A52602f503. Buybacks are made by hand when the team decides and have not started yet.",
    [LABELS.TokenBurn]: "80% of car sales burned, until 2026-09-23 05:59 UTC.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // Uniswap v4 already counts the pool's 0.1% LP fee (dexs/uniswap-v4), so this listing is kept out of chain totals.
  doublecounted: true,
  start: "2026-09-22", // GasFeeReceiver deployed 2026-09-22 23:50 UTC (block 70061809); first fee forward block 70084575
  methodology,
  breakdownMethodology,
};

export default adapter;
