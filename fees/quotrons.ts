import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// Public integration manifest and contract explorers:
// https://quotrons.cash/integration/manifest.json
// https://robinhoodchain.blockscout.com/address/0x5A7D914597476393794E100dDD8b70f8c3f570CC?tab=contract
// https://robinhoodchain.blockscout.com/address/0x62E200Cc8e4D95cf622f40Dd70f407C883EcB0cc?tab=contract
const V1_HOOK = "0x5A7D914597476393794E100dDD8b70f8c3f570CC";
const V2_HOOK = "0x62E200Cc8e4D95cf622f40Dd70f407C883EcB0cc";
const SPLITTER = "0xd8eb805e96B05cb412A1e48eb3a85B6267f901d7";
const COLLECTIONS = new Set([
  "0xbde7bec47cbfc689e5e952b6cdd113a500abcd83", // V1 mirror
  "0x027aca2794e44f24950d81227dcd516ffbb49d6e", // V2 mirror
]);
// OpenSea pays the 4% keeper and 1% creator legs directly, bypassing ERC-2981.
// Royalty configuration: https://opensea.io/collection/quotrons404
const DIRECT_RECIPIENTS = new Set([
  "0xd1de50b724de2e243d3f6f3c3ef1806babd39e58",
  "0x7171e64e979265aed6588577d1c6b60a701d7866",
]);
const SEAPORT = "0x0000000000000068F116a894984e2DB1123eB395";
const FEE_EVENT = "event FeeTaken(bytes32 indexed poolId, address indexed swapper, uint256 feeBps, uint256 total, uint256 toReflections, uint256 toBurn, uint256 toLp, uint256 toCreator)";
const SALE_EVENT = "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)";
const LABEL = "Swap Fees and NFT Royalties";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
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
  for (const log of v1Fees) dailyFees.add(stockByPool[log.poolId], log.total, LABEL);
  for (const log of v2Fees) dailyFees.add(ADDRESSES.robinhood.WETH, log.total, LABEL);

  const sales = await options.getLogs({ target: SEAPORT, eventAbi: SALE_EVENT });
  for (const sale of sales) {
    // Listings put NFTs in offer; accepted bids put NFTs in consideration.
    const nfts = [...sale.offer, ...sale.consideration].filter(item => Number(item.itemType) >= 2);
    if (!nfts.some(item => COLLECTIONS.has(item.token.toLowerCase()))) continue;
    // Mixed-collection bundles do not expose a per-collection royalty split.
    if (nfts.some(item => !COLLECTIONS.has(item.token.toLowerCase())))
      throw new Error(`Cannot attribute mixed-collection royalty for order ${sale.orderHash}`);

    for (const item of sale.consideration) {
      if (Number(item.itemType) > 1 || !DIRECT_RECIPIENTS.has(item.recipient.toLowerCase())) continue;
      // Seller proceeds are not royalties if a royalty recipient sells its NFT.
      const seller = sale.offer.some((offer: any) => Number(offer.itemType) >= 2)
        ? sale.offerer : sale.recipient;
      if (item.recipient.toLowerCase() === seller.toLowerCase()) continue;
      dailyFees.add(item.token, item.amount, LABEL);
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
  for (const log of nativeRoyalties) dailyFees.addGasToken(log.total, LABEL);
  for (const log of tokenRoyalties) dailyFees.add(log.token, log.total, LABEL);

  return { dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-12",
  fetch,
  // Gross fees only: these receipts do not establish the final revenue/supply
  // split after keeper conversions, stock purchases, LP reinvestment and payouts.
  skipBreakdownValidation: true,
  methodology: {
    Fees: "Total Quotrons V1 and V2 hook swap fees plus NFT royalties paid directly through Seaport or released by the royalty splitter on Robinhood Chain, excluding marketplace fees and subsequent redistribution of the same funds.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL]: "Actual hook fee amounts in floor stocks or WETH, plus direct Quotrons sale royalties and royalty splitter releases in their payment currencies; ERC-20 splitter royalties are recognized when released.",
    },
  },
};

export default adapter;
