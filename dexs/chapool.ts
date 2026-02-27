import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const PAYMENT_CONTRACT = "0xEe83640f0ed07d36E799531CC6d87FB4CDcCaC13";
const MARKETPLACE_CONTRACT = "0x6374aD0E4adab392dFeE60304a16ADc569f06703";
const USDT_ADDRESS = "0x9e5AAC1Ba1a2e6aEd6b32689DFcF62A509Ca96f3";

// Event ABIs
const ITEM_SOLD_ABI =
  "event ItemSold(uint256 indexed listingId, address indexed seller, address indexed buyer, address payer, uint256 price, uint256 platformFee)";
const AUCTION_SETTLED_ABI =
  "event AuctionSettled(uint256 indexed listingId, address indexed seller, address indexed winner, address payer, uint256 finalPrice, uint256 platformFee)";
const PAYMENT_MADE_ABI =
  "event PaymentMade(uint256 indexed orderId, address indexed payer, address indexed token, uint256 amount, uint256 timestamp)";

const fetch = async (options: FetchOptions) => {
  const [itemSoldLogs, auctionSettledLogs, allPaymentLogs] = await Promise.all([
    options.getLogs({
      target: MARKETPLACE_CONTRACT,
      eventAbi: ITEM_SOLD_ABI,
    }),
    options.getLogs({
      target: MARKETPLACE_CONTRACT,
      eventAbi: AUCTION_SETTLED_ABI,
    }),
    options.getLogs({
      target: PAYMENT_CONTRACT,
      eventAbi: PAYMENT_MADE_ABI,
    }),
  ]);
  
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  for (const log of itemSoldLogs) {
    dailyVolume.add(USDT_ADDRESS, log.price);
    dailyFees.add(USDT_ADDRESS, log.platformFee);
  }

  for (const log of auctionSettledLogs) {
    dailyVolume.add(USDT_ADDRESS, log.finalPrice);
    dailyFees.add(USDT_ADDRESS, log.platformFee);
  }

  for (const log of allPaymentLogs) {
    dailyFees.add(log.token, log.amount);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "NFT minting fees (Payment contract pay function) + NFT trading fees (C2C marketplace 5% platform fee) in USDT",
  Revenue:
    "NFT minting fees (Payment contract pay function) + NFT trading fees (C2C marketplace 5% platform fee) in USDT",
  ProtocolRevenue: "All revenue are collected by protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.OP_BNB]: {
      start: "2025-12-08",
    },
  },
  methodology,
};

export default adapter;
