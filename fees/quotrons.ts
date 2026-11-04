import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { nullAddress } from "../helpers/token";

// Public integration manifest and contract explorers:
// https://quotrons.cash/integration/manifest.json
// https://robinhoodchain.blockscout.com/address/0x5A7D914597476393794E100dDD8b70f8c3f570CC?tab=contract
// https://robinhoodchain.blockscout.com/address/0x62E200Cc8e4D95cf622f40Dd70f407C883EcB0cc?tab=contract
const V1_HOOK = "0x5A7D914597476393794E100dDD8b70f8c3f570CC";
const V2_HOOK = "0x62E200Cc8e4D95cf622f40Dd70f407C883EcB0cc";
const SPLITTER = "0xd8eb805e96B05cb412A1e48eb3a85B6267f901d7";
// Reward contracts allocate converted assets to terminal holders.
const V1_REFLECTIONS = "0x666A51Eb731a9CF79d97B4A9c64cD5a4806c877C";
const V2_REFLECTIONS = "0xe04fba61FD54Ba78Dd450A30d8Af40167aF5d3Ec";
const ROYALTY_REFLECTIONS = "0x424F0d6cee21E6227239f4Ae6e14ACD2C3D51424";
const TRADING_CONVERTER = "0x24e62Dd5C7058CC41ad9c5375C137460ea1Da2FE";
const ROYALTY_CONVERTER = "0x8168762be8D09804D5B17D3BD4C10807D4F8CF3a";
// First V1 FloorPotClaimed positions, indexed by floor. Before these events,
// toFloor is unallocated; afterwards permanent hardwiring keeps weight positive.
// Event evidence: https://robinhoodchain.blockscout.com/address/0x666A51Eb731a9CF79d97B4A9c64cD5a4806c877C?tab=logs
const V1_FIRST_FLOOR_ALLOCATION = [
  [34692551, 8], [34694499, 8], [34693341, 6], [34692412, 5], [34693896, 63],
  [34693811, 6], [34692640, 9], [34693148, 2], [34692983, 2], [34694176, 2],
];
const COLLECTIONS = new Set([
  "0xbde7bec47cbfc689e5e952b6cdd113a500abcd83", // V1 mirror
  "0x027aca2794e44f24950d81227dcd516ffbb49d6e", // V2 mirror
]);
// OpenSea pays the 4% keeper and 1% creator legs directly, bypassing ERC-2981.
// Royalty configuration: https://opensea.io/collection/quotrons404
const KEEPER = "0xd1de50b724de2e243d3f6f3c3ef1806babd39e58";
const CREATOR = "0x7171e64e979265aed6588577d1c6b60a701d7866";
const DIRECT_RECIPIENTS = new Set([KEEPER, CREATOR]);
const SEAPORT = "0x0000000000000068F116a894984e2DB1123eB395";
const FEE_EVENT = "event FeeTaken(bytes32 indexed poolId, address indexed swapper, uint256 feeBps, uint256 total, uint256 toReflections, uint256 toBurn, uint256 toLp, uint256 toCreator)";
const SALE_EVENT = "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)";
const SWAP_LABEL = "Swap Fees";
const ROYALTY_LABEL = "NFT Royalties";
const LP_LABEL = "Swap Fees To LPs";
const CREATOR_LABEL = "Swap Fees To Creators";
const BURN_LABEL = "Swap Fees Allocated To STONKBROKER Burns";
const REFLECTION_LABEL = "Swap Fees For Terminal Rewards";
const ROYALTY_CREATOR_LABEL = "NFT Royalties To Creator";
const ROYALTY_KEEPER_LABEL = "NFT Royalties To Keeper";
const SWAP_REWARDS_LABEL = "Trading Rewards Accrued To Terminal Holders";
const ROYALTY_REWARDS_LABEL = "Royalty Rewards Accrued To Terminal Holders";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const addHookFee = (token: string, log: any) => {
    dailyFees.add(token, log.total, SWAP_LABEL);
    dailySupplySideRevenue.add(token, log.toLp, LP_LABEL);
    dailySupplySideRevenue.add(token, log.toCreator, CREATOR_LABEL);
    // The advisory vote did not change the sealed V2 burn sink or fee carve.
    // This is the allocation at accrual, not a claim about final net spending.
    // Subsequent flash-loan recoveries are documented in the submission:
    // https://github.com/DefiLlama/dimension-adapters/pull/10611
    dailySupplySideRevenue.add(token, log.toBurn, BURN_LABEL);
    dailyRevenue.add(token, BigInt(log.total) - BigInt(log.toLp) - BigInt(log.toCreator) - BigInt(log.toBurn), REFLECTION_LABEL);
  };
  const addRoyalty = (token: string, total: bigint, creatorAmount: bigint) => {
    dailyFees.add(token, total, ROYALTY_LABEL);
    dailySupplySideRevenue.add(token, creatorAmount, ROYALTY_CREATOR_LABEL);
    dailyRevenue.add(token, BigInt(total) - BigInt(creatorAmount), ROYALTY_KEEPER_LABEL);
  };
  const [v1Fees, v2Fees] = await options.getLogs({
    targets: [V1_HOOK, V2_HOOK],
    eventAbi: FEE_EVENT,
    flatten: false,
  });

  // V1 fees are denominated in each pool's floor stock. Read its registered
  // currency at the window end, and only query pools with fees in this window.
  const poolIds = [...new Set<string>(v1Fees.map((log: any) => log.poolId))];
  const floors = await options.api.multiCall({
    target: V1_HOOK,
    abi: "function floorOf(bytes32) view returns (uint8)",
    calls: poolIds.map(poolId => ({ params: [poolId] })),
  });
  const stocks = await options.api.multiCall({
    target: V1_HOOK,
    abi: "function floorStock(uint256) view returns (address)",
    // floorOf is 1-based (zero means unregistered); floorStock is 0-based.
    calls: floors.map(floor => ({ params: [Number(floor) - 1] })),
  });
  const stockByPool = Object.fromEntries(poolIds.map((poolId, index) => [poolId, stocks[index]]));
  for (const log of v1Fees) addHookFee(stockByPool[log.poolId], log);
  for (const log of v2Fees) addHookFee(ADDRESSES.robinhood.WETH, log);

  const sales = await options.getLogs({ target: SEAPORT, eventAbi: SALE_EVENT });
  for (const sale of sales) {
    // Listings put NFTs in offer; accepted bids put NFTs in consideration.
    const nfts = [...sale.offer, ...sale.consideration].filter(item => Number(item.itemType) >= 2);
    if (!nfts.some(item => COLLECTIONS.has(item.token.toLowerCase()))) continue;
    // Exclude direct royalties from mixed-collection orders: their payment
    // amounts may cover the whole bundle, with no per-collection allocation.
    if (nfts.some(item => !COLLECTIONS.has(item.token.toLowerCase()))) continue;

    for (const item of sale.consideration) {
      if (Number(item.itemType) > 1 || !DIRECT_RECIPIENTS.has(item.recipient.toLowerCase())) continue;
      // Seller proceeds are not royalties if a royalty recipient sells its NFT.
      const seller = sale.offer.some((offer: any) => Number(offer.itemType) >= 2)
        ? sale.offerer : sale.recipient;
      if (item.recipient.toLowerCase() === seller.toLowerCase()) continue;
      addRoyalty(item.token, item.amount, item.recipient.toLowerCase() === CREATOR ? item.amount : 0n);
    }
  }

  // The dedicated ERC-2981 splitter also accepts royalties from other venues.
  // Count its releases once; Seaport payments TO the splitter are excluded above.
  // Native payments release immediately; ERC-20 royalties are booked on release.
  // https://robinhoodchain.blockscout.com/address/0xd8eb805e96B05cb412A1e48eb3a85B6267f901d7?tab=contract
  const nativeRoyalties = await options.getLogs({
    target: SPLITTER,
    eventAbi: "event NativeRoyaltyReleased(uint256 total, uint256 keeperAmount, uint256 creatorAmount)",
  });
  const tokenRoyalties = await options.getLogs({
    target: SPLITTER,
    eventAbi: "event TokenRoyaltyReleased(address indexed token, uint256 total, uint256 keeperAmount, uint256 creatorAmount)",
  });
  for (const log of nativeRoyalties) addRoyalty(nullAddress, log.total, log.creatorAmount);
  for (const log of tokenRoyalties) addRoyalty(log.token, log.total, log.creatorAmount);

  const targets = [V1_REFLECTIONS, V2_REFLECTIONS, ROYALTY_REFLECTIONS];
  const notifications = await options.getLogs({
    targets,
    eventAbi: "event FeesNotified(uint8 indexed floorIdx, uint256 amount, uint256 toFloor, uint256 toBasket, uint256 toGold)",
    entireLog: true,
    flatten: false,
  });
  const floorPotClaims = await options.getLogs({
    targets,
    eventAbi: "event FloorPotClaimed(uint8 indexed floorIdx, uint256 indexed id, uint256 amount)",
    flatten: false,
  });
  // Each converter notifies reflections and emits FloorConverted in the same
  // transaction. Value allocations at their actual USDG acquisition cost ($1,
  // 6 decimals), avoiding incomplete historical price feeds for reward stocks.
  // https://robinhoodchain.blockscout.com/address/0x24e62Dd5C7058CC41ad9c5375C137460ea1Da2FE?tab=contract
  // https://robinhoodchain.blockscout.com/address/0x8168762be8D09804D5B17D3BD4C10807D4F8CF3a?tab=contract
  const tradingConversions = await options.getLogs({
    target: TRADING_CONVERTER,
    eventAbi: "event FloorConverted(uint256 indexed epoch, uint8 indexed floorIdx, uint256 wethIn, uint256 usdgOut, uint256 stockOut)",
  });
  const royaltyConversions = await options.getLogs({
    target: ROYALTY_CONVERTER,
    eventAbi: "event FloorConverted(uint256 indexed epoch, uint8 indexed floorIdx, uint256 usdgIn, uint256 stockOut)",
  });
  // These token catalogs are set once. Read their immutable configuration at
  // latest so public RPCs do not need historical contract state.
  const configApi = new ChainApi({ chain: options.chain });
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (target !== V1_REFLECTIONS) {
      const isRoyalty = target === ROYALTY_REFLECTIONS;
      const conversions = isRoyalty ? royaltyConversions : tradingConversions;
      // Fail if the funding route changes instead of silently dropping a direct
      // notification or counting a conversion that did not allocate rewards.
      const allocated = new Map<number, bigint>();
      for (const log of notifications[i]) {
        const floor = Number(log.args.floorIdx);
        allocated.set(floor, (allocated.get(floor) ?? 0n) + BigInt(log.args.amount));
      }
      let usdg = 0n;
      for (const log of conversions) {
        const floor = Number(log.floorIdx);
        allocated.set(floor, (allocated.get(floor) ?? 0n) - BigInt(log.stockOut));
        usdg += BigInt(isRoyalty ? log.usdgIn : log.usdgOut);
      }
      if (floorPotClaims[i].length || [...allocated.values()].some(amount => amount !== 0n))
        throw new Error(`Unmatched Quotrons reward allocations for ${target}`);
      dailyHoldersRevenue.addUSDValue(Number(usdg) / 1e6, isRoyalty ? ROYALTY_REWARDS_LABEL : SWAP_REWARDS_LABEL);
      continue;
    }
    const floorIds = [...new Set<number>([
      ...notifications[i].map((log: any) => Number(log.args.floorIdx)),
      ...floorPotClaims[i].map((log: any) => Number(log.floorIdx)),
    ])];
    if (!floorIds.length) continue;
    const calls = floorIds.map(floor => ({ params: [floor] }));
    const stocks = await configApi.multiCall({ target, abi: "function floorStocks(uint256) view returns (address)", calls });
    const stockByFloor = Object.fromEntries(floorIds.map((floor, index) => [floor, stocks[index]]));
    const label = SWAP_REWARDS_LABEL;
    for (const log of notifications[i]) {
      const reward = log.args;
      let accrued = BigInt(reward.amount);
      if (target === V1_REFLECTIONS) {
        // V1 gold stocks await conversion: recognize the PAXG deposit instead.
        accrued -= BigInt(reward.toGold);
        const [block, index] = V1_FIRST_FLOOR_ALLOCATION[Number(reward.floorIdx)];
        if (Number(log.blockNumber) < block || (Number(log.blockNumber) === block && Number(log.logIndex ?? log.index) < index))
          accrued -= BigInt(reward.toFloor);
      }
      dailyHoldersRevenue.add(stockByFloor[Number(reward.floorIdx)], accrued, label);
    }
    for (const log of floorPotClaims[i])
      dailyHoldersRevenue.add(stockByFloor[Number(log.floorIdx)], log.amount, label);
  }
  const paxgDeposits = await options.getLogs({ target: V1_REFLECTIONS, eventAbi: "event PaxgDeposited(uint256 amount)" });
  if (paxgDeposits.length) {
    const paxg = await options.api.call({ target: V1_REFLECTIONS, abi: "address:paxg" });
    for (const log of paxgDeposits) dailyHoldersRevenue.add(paxg, log.amount, SWAP_REWARDS_LABEL);
  }
  // LegacyCredited and Claimed only move rewards already recognized at accrual.

  return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-12",
  fetch,
  methodology: {
    Fees: "Total Quotrons V1 and V2 hook swap fees plus NFT royalties paid directly through Seaport or released by the royalty splitter on Robinhood Chain, excluding direct royalties from mixed-collection orders, marketplace fees and subsequent redistribution of the same funds.",
    SupplySideRevenue: "Hook fee allocations to LP reinvestment, STONKBROKER burns and the creator, plus the creator portion of NFT royalties, recorded at accrual or royalty receipt/release; allocations precede any later treasury recovery.",
    Revenue: "Hook fees allocated to terminal rewards and the keeper portion of NFT royalties, before conversion and distribution to terminals; later treasury recoveries are excluded.",
    HoldersRevenue: "V2 trading and royalty rewards recognized on allocation at actual USDG conversion cost, with USDG valued at $1. V1 allocated stocks and PAXG use historical token prices. Unallocated pots, queued conversion funds, migration credits and subsequent claims are excluded.",
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_LABEL]: "Actual V1 and V2 hook fee totals in floor stocks or WETH, including FeeTaken events emitted by recovery swaps; recovered principal and flash-loan transfers are excluded.",
      [ROYALTY_LABEL]: "Direct royalties on Quotrons-only Seaport orders and royalty splitter releases in their payment currencies; ERC-20 splitter royalties are recognized when released.",
    },
    SupplySideRevenue: {
      [LP_LABEL]: "Actual toLp amounts allocated by the V1 and V2 hooks to LP reinvestment, recorded at the swap.",
      [CREATOR_LABEL]: "Actual toCreator amounts allocated by the V1 and V2 hooks to the creator, recorded at the swap.",
      [BURN_LABEL]: "Actual toBurn amounts earmarked by the V1 and V2 hooks for the separate STONKBROKER token; the immutable V2 allocation continues after the advisory vote and periodic recoveries.",
      [ROYALTY_CREATOR_LABEL]: "Direct NFT royalty payments to the creator and creatorAmount from the dedicated splitter's release events.",
    },
    Revenue: {
      [REFLECTION_LABEL]: "Hook fee totals less toLp, toCreator and toBurn, retained for terminal reward conversion and distribution.",
      [ROYALTY_KEEPER_LABEL]: "Direct NFT royalty payments to the keeper and splitter totals less creatorAmount, retained for the royalty reward pipeline.",
    },
    HoldersRevenue: {
      [SWAP_REWARDS_LABEL]: "V2 FloorConverted.usdgOut measures USDG spent acquiring stocks allocated to holders, at $1 per USDG. V1 stock notifications exclude gold and unallocated floor shares, adding first-holder pot releases; PAXG counts only when deposited. V1 stocks retain historical token pricing. Migration credits and claims are excluded.",
      [ROYALTY_REWARDS_LABEL]: "Royalty FloorConverted.usdgIn measures USDG spent acquiring stocks allocated to holders, at $1 per USDG, reconciled to reward notifications. Keeper receipts, queued funds and subsequent claims are excluded.",
    },
  },
};

export default adapter;
