// HASHCATS — fees & revenue adapter.
//
// HASHCATS is a proof-of-work NFT collection on Robinhood Chain (chainId 4663).
// A cat is minted only when a miner submits a hash below the collection's target,
// and the entry price is derived rather than chosen: it is the number of cats
// created so far times a fixed step, so it rises with every mint.
//
//   Collection: 0xca75df55cc9c476db27a7375d1fc8e794cf80721
//   Hook:       0xca757986e932bc55776492cca0b413e9b3d02acc
//   $HASH:      0xca75082b85bb7bec8325d513f615b16bda260020
//
// Money enters the protocol from three places. Two of them are always ether;
// royalties arrive as ether or as WETH, depending on how the sale settled:
//
// 1. Mints. The price of a cat is split on the spot by the collection: a fixed
//    share per past cat accrues as rent to the cats still alive, and the rest is
//    forwarded to the hook. Burned cats have no claim, so their share of the rent
//    is forwarded to the hook as well. The whole price is a fee paid by the
//    miner: there is no third-party seller, no allowlist and no team allocation,
//    and every wei of it stays inside the protocol.
//
// 2. The trading fee on the $HASH pool, taken by the hook in beforeSwap or
//    afterSwap depending on which side of the pair the trader specified. The pool
//    itself has a zero fee, so this is entirely the protocol's. The rate decays
//    from a high opening value to its target over the first ten minutes of
//    trading (a launch defense that arms once), which is why it is read from the
//    FeeTaken events rather than computed from a rate.
//
// 3. Secondary-market royalties. The collection names the hook as the ERC-2981
//    recipient, so marketplace royalties arrive at the hook directly - as ether
//    through its receive(), or as WETH when the sale settled in WETH.
//
// Everything the hook receives is split by devBps: the developer's share accrues
// for withdrawal, and the remainder joins the buyback queue, which is spent
// buying $HASH back and burning it. The split is applied to revenue here rather
// than read from the DevAccrued events, because royalties that arrive as WETH
// pass through the split later, when they are unwrapped - so the events lag the
// income by an unpredictable amount while the rate itself never does.
//
// Classification:
//
//   dailyFees               everything paid by users: mint prices, trading fees
//                           and royalties.
//   dailySupplySideRevenue  rent to living cats. Cat holders are suppliers, not
//                           governance-token holders: the cat is the asset that
//                           earns, and the payment is a cost of revenue.
//   dailyRevenue            fees minus rent.
//   dailyHoldersRevenue     the queue's share of revenue, spent buying $HASH back
//                           and burning it. Measured at the fee source, which is
//                           where the split happens, not at the moment a buyback
//                           executes.
//   dailyProtocolRevenue    the developer's share of revenue.
//
// Not counted: $HASH handed out when a cat is burned. The holder destroys an
// asset that was earning rent and receives another asset in exchange, so it is a
// conversion rather than an incentive, and no fee is paid by anyone.
//
// The hook's own buybacks pay no trading fee: Uniswap does not invoke hooks on
// swaps the hook itself sends, so they cannot inflate this adapter.

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const COLLECTION = "0xca75df55cc9c476db27a7375d1fc8e794cf80721";
const HOOK = "0xca757986e932bc55776492cca0b413e9b3d02acc";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

const BPS = 10000n;

// Rent is paid to cat holders, who are suppliers here rather than holders of a
// governance token - the METRIC list has no label for it, so it carries its own.
const RENT = "Rent to Cat Holders";

const MINED =
  "event Mined(uint256 indexed tokenId, address indexed miner, uint256 seed, uint256 work, bytes32 anchor, uint256 target, uint256 nonce, uint256 unique)";
const FUNDED = "event Funded(address indexed from, uint256 amount, uint256 queue)";
const FEE_TAKEN = "event FeeTaken(bool buying, uint256 amount)";
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";
// keccak256("Transfer(address,address,uint256)"), with the hook padded to a topic:
// royalties that settled in WETH are filtered to this recipient at the node.
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HOOK_TOPIC = `0x000000000000000000000000${HOOK.slice(2)}`;

// Cats created before epoch k begins: EPOCH0 * 2^k - EPOCH0. The price of a cat
// is that count times PRICE_STEP, which is why the price doubles every epoch.
const createdBefore = (k: bigint, epoch0: bigint) => epoch0 * (2n ** k - 1n);

// Price of a given cat, the same derivation the collection performs on-chain.
// The constants come from the contract rather than from this file, so a
// redeployment with different economics cannot silently produce wrong numbers.
const priceOf = (tokenId: bigint, epoch0: bigint, priceEpoch0: bigint, priceStep: bigint) => {
  let k = 0n;
  // The bound is a guard, not a limit: epochs double, so 255 of them cover any
  // token id that fits in a uint256. Without it a zero epoch size - which the
  // contract cannot produce, but a wrong read could - would spin forever.
  while (k < 255n && createdBefore(k + 1n, epoch0) < tokenId) k++;
  // Epoch zero is sold at a flat price and pays no rent: there are no past cats
  // to pay, so the whole price goes to the hook.
  if (k === 0n) return priceEpoch0;
  return createdBefore(k, epoch0) * priceStep;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // The same object is returned either way: empty when the protocol did not
  // exist yet, filled in once the window has something in it.
  const result = {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };

  // Read at the END of the window, not the start: the first day's window opens
  // hours before the collection is deployed, and reading there would revert.
  // The three price constants are immutable, so the height cannot change them;
  // devBps and the owner are read at the same point for consistency.
  const [epoch0, priceEpoch0, priceStep, devBps, hookOwner] = await Promise.all([
    options.toApi.call({ abi: "uint256:EPOCH0", target: COLLECTION }),
    options.toApi.call({ abi: "uint256:PRICE_EPOCH0", target: COLLECTION }),
    options.toApi.call({ abi: "uint256:PRICE_STEP", target: COLLECTION }),
    options.toApi.call({ abi: "uint16:devBps", target: HOOK }),
    options.toApi.call({ abi: "address:owner", target: HOOK }),
  ]);

  // The collection forwards the hook's cut with a capped gas stipend. If that
  // transfer ever fails the amount is held in hookDue and sent with a later
  // mint, which would otherwise push a window's receipts out of step with its
  // mints - and the rent, being the remainder, straight into nonsense. Taking
  // the change in hookDue puts every mint's cut back in its own window.
  //
  // The two readings have to bracket exactly the blocks whose logs a re counted.
  // getLogs includes the window's first block, while fromApi reads the state
  // after that block has already run, so the opening reading is taken one block
  // earlier - otherwise a deferral in that first block would be missing from the
  // difference while its mint was counted, and the rent would absorb the error.
  const windowStart = await options.getFromBlock();
  const [dueBefore, dueAfter] = await Promise.all([
    options.api.call({
      abi: "uint256:hookDue",
      target: COLLECTION,
      block: windowStart - 1,
    }),
    options.toApi.call({ abi: "uint256:hookDue", target: COLLECTION }),
  ]);

  const [mined, funded, feeTaken, wethIn] = await Promise.all([
    options.getLogs({ target: COLLECTION, eventAbi: MINED }),
    options.getLogs({ target: HOOK, eventAbi: FUNDED }),
    options.getLogs({ target: HOOK, eventAbi: FEE_TAKEN }),
    options.getLogs({ target: WETH, eventAbi: TRANSFER, topics: [TRANSFER_TOPIC, null, HOOK_TOPIC] as any }),
  ]);

  // 1. What miners paid, derived per cat from the price curve.
  const epochSize = BigInt(epoch0);
  const flatPrice = BigInt(priceEpoch0);
  const step = BigInt(priceStep);
  let mintGross = 0n;
  for (const log of mined) {
    mintGross += priceOf(BigInt(log.tokenId), epochSize, flatPrice, step);
  }

  // 2. The hook's cut of those mints, taken straight from its own receipts.
  //    The rent is the remainder, so it never has to be reconstructed from the
  //    rent accumulator - which moves in fractions and would not reconcile.
  const owner = String(hookOwner).toLowerCase();
  let hookFromMints = 0n;
  let royaltiesEth = 0n;
  for (const log of funded) {
    const from = String(log.from).toLowerCase();
    const amount = BigInt(log.amount);
    if (from === COLLECTION) {
      hookFromMints += amount;
    } else if (from === WETH.toLowerCase() || from === owner || from === HOOK) {
      // Not income. WETH unwrapping is royalty money already counted when it
      // arrived, and addLiquidity returns the owner's own unspent deposit to the
      // queue through this very same event.
      continue;
    } else {
      royaltiesEth += amount;
    }
  }
  const hookAccrued = hookFromMints + BigInt(dueAfter) - BigInt(dueBefore);
  const rent = mintGross - hookAccrued;

  // 3. Trading fee, and royalties that settled in WETH.
  let tradingFees = 0n;
  for (const log of feeTaken) tradingFees += BigInt(log.amount);

  let royaltiesWeth = 0n;
  for (const log of wethIn) royaltiesWeth += BigInt(log.value);

  dailyFees.addGasToken(mintGross, METRIC.MINT_REDEEM_FEES);
  dailyFees.addGasToken(tradingFees, METRIC.SWAP_FEES);
  dailyFees.addGasToken(royaltiesEth, METRIC.CREATOR_FEES);
  dailyFees.add(WETH, royaltiesWeth, METRIC.CREATOR_FEES);

  dailySupplySideRevenue.addGasToken(rent, RENT);

  // Revenue is what is left once the suppliers are paid, split by the hook's
  // rate. Each currency is split on its own so the two sides always reconcile.
  const splitToDev = (amount: bigint) => (amount * BigInt(devBps)) / BPS;

  const revenueEth = hookAccrued + tradingFees + royaltiesEth;
  const devEth = splitToDev(revenueEth);
  const devWeth = splitToDev(royaltiesWeth);

  dailyRevenue.addGasToken(revenueEth - devEth, METRIC.TOKEN_BUY_BACK);
  dailyRevenue.addGasToken(devEth, METRIC.PROTOCOL_FEES);
  dailyRevenue.add(WETH, royaltiesWeth - devWeth, METRIC.TOKEN_BUY_BACK);
  dailyRevenue.add(WETH, devWeth, METRIC.PROTOCOL_FEES);

  dailyHoldersRevenue.addGasToken(revenueEth - devEth, METRIC.TOKEN_BUY_BACK);
  dailyHoldersRevenue.add(WETH, royaltiesWeth - devWeth, METRIC.TOKEN_BUY_BACK);

  dailyProtocolRevenue.addGasToken(devEth, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.add(WETH, devWeth, METRIC.PROTOCOL_FEES);

  return result;
};

const methodology = {
  Fees: "Everything users pay the protocol: the price of every cat minted, the trading fee the hook takes on the $HASH pool, and the secondary-market royalty the collection routes to the hook. The mint price is derived per cat from the contract's own curve - the number of cats created so far times PRICE_STEP - rather than read from a transaction value, so a mint sent with excess ether cannot inflate it.",
  UserFees: "Same as Fees. Every one of the three flows is paid by a user: the miner pays the entry price, the trader pays the swap fee, and the secondary-market buyer pays the royalty.",
  Revenue: "Fees minus the rent paid out to living cats.",
  SupplySideRevenue: "Rent paid to the cats already alive. Every mint splits its price between the cats that came before it and the hook; cat holders are suppliers whose asset earns, not holders of a governance token, so their cut is a cost of revenue. Measured as the mint price minus the hook's cut, which is exact and needs no reconstruction from the rent accumulator. The hook's cut is what it was owed in the window rather than what it was sent: a transfer that fails its gas stipend is held in the collection's hookDue and forwarded later, so the change in that balance is added back.",
  HoldersRevenue: "The share of revenue that joins the hook's buyback queue and is spent buying $HASH back on the pool and burning it. Measured at the fee source - the moment the hook receives and splits the money - rather than when a buyback executes, since the queue is drained gradually under a per-block cap.",
  ProtocolRevenue: "The developer's share of revenue, at the hook's devBps rate, read from the chain rather than hardcoded.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: "The price paid for every cat mined in the window, derived per cat from the contract's price curve.",
    [METRIC.SWAP_FEES]: "The trading fee the hook takes on $HASH swaps. The pool's own fee is zero, so this is the whole of it. The rate decays from its opening value to its target over the first ten minutes of trading, so the amounts are read from FeeTaken rather than computed.",
    [METRIC.CREATOR_FEES]: "Secondary-market royalties, which the collection routes to the hook as the ERC-2981 recipient - in ether, or in WETH when the sale settled in WETH.",
  },
  UserFees: {
    [METRIC.MINT_REDEEM_FEES]: "The price paid for every cat mined in the window.",
    [METRIC.SWAP_FEES]: "The trading fee paid by swappers on the $HASH pool.",
    [METRIC.CREATOR_FEES]: "Royalties paid by secondary-market buyers.",
  },
  Revenue: {
    [METRIC.TOKEN_BUY_BACK]: "The part of revenue that joins the buyback queue.",
    [METRIC.PROTOCOL_FEES]: "The developer's share of revenue, at the hook's devBps rate.",
  },
  SupplySideRevenue: {
    [RENT]: "Rent accrued to the cats alive at the time of each mint, paid out of that mint's price.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Ether queued for buying $HASH back on the pool and burning it.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "The developer's share of everything the hook receives.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-11",
  methodology,
  breakdownMethodology,
};

export default adapter;
