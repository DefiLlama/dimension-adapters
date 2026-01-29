import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";

const PAYMENT_CONTRACT = "0xEe83640f0ed07d36E799531CC6d87FB4CDcCaC13";
const MARKETPLACE_CONTRACT = "0x6374aD0E4adab392dFeE60304a16ADc569f06703";
const USDT_ADDRESS = "0x9e5AAC1Ba1a2e6aEd6b32689DFcF62A509Ca96f3";

// Event ABIs
const ITEM_SOLD_ABI = "event ItemSold(uint256 indexed listingId, address indexed seller, address indexed buyer, address payer, uint256 price, uint256 platformFee)";
const AUCTION_SETTLED_ABI = "event AuctionSettled(uint256 indexed listingId, address indexed seller, address indexed winner, address payer, uint256 finalPrice, uint256 platformFee)";
const PAYMENT_MADE_ABI = "event PaymentMade(uint256 indexed orderId, address indexed payer, address indexed token, uint256 amount, uint256 timestamp)";

// Calculate event topic0 signatures
const itemSoldInterface = new ethers.Interface([ITEM_SOLD_ABI]);
const auctionSettledInterface = new ethers.Interface([AUCTION_SETTLED_ABI]);
const paymentMadeInterface = new ethers.Interface([PAYMENT_MADE_ABI]);

const ITEM_SOLD_TOPIC0 = itemSoldInterface.getEvent("ItemSold")!.topicHash;
const AUCTION_SETTLED_TOPIC0 = auctionSettledInterface.getEvent("AuctionSettled")!.topicHash;
const PAYMENT_MADE_TOPIC0 = paymentMadeInterface.getEvent("PaymentMade")!.topicHash;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { getLogs, getFromBlock, getToBlock } = options;

  // Get block range
  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  // 1. Fetch C2C Marketplace events
  // Use raw topics for accuracy and skipCache to prevent caching issues
  const [itemSoldLogs, auctionSettledLogs] = await Promise.all([
    getLogs({
      target: MARKETPLACE_CONTRACT,
      topics: [ITEM_SOLD_TOPIC0],
      fromBlock,
      toBlock,
      skipCache: true,
    }),
    getLogs({
      target: MARKETPLACE_CONTRACT,
      topics: [AUCTION_SETTLED_TOPIC0],
      fromBlock,
      toBlock,
      skipCache: true,
    }),
  ]);

  // 2. Fetch Payment contract events
  const allPaymentLogs = await getLogs({
    target: PAYMENT_CONTRACT,
    topics: [PAYMENT_MADE_TOPIC0],
    fromBlock,
    toBlock,
    skipCache: true,
  });
  
  // Filter for USDT payment events
  // PaymentMade(uint256 indexed orderId, address indexed payer, address indexed token, uint256 amount, uint256 timestamp)
  // topic0: sig
  // topic1: orderId
  // topic2: payer
  // topic3: token
  const paymentLogs = allPaymentLogs.filter((log: any) => {
    if (log.topics.length < 4) return false;
    const tokenTopic = log.topics[3];
    // Check if token matches USDT (last 40 chars)
    return tokenTopic.toLowerCase().includes(USDT_ADDRESS.toLowerCase().slice(2));
  });

  // 3. Calculate Daily Fees (C2C marketplace 5% platform fee)
  let dailyFees = 0;
  
  // ItemSold: payer, price, platformFee
  itemSoldLogs.forEach((log: any) => {
    const parsedLog = itemSoldInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsedLog) {
        dailyFees += Number(parsedLog.args.platformFee) / 1e18;
    }
  });

  // AuctionSettled: payer, finalPrice, platformFee
  auctionSettledLogs.forEach((log: any) => {
    const parsedLog = auctionSettledInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsedLog) {
        dailyFees += Number(parsedLog.args.platformFee) / 1e18;
    }
  });

  // 4. Calculate Daily Revenue (NFT minting fees + NFT trading fees)
  let dailyRevenue = 0;
  
  // NFT minting fees (Payment pay function)
  paymentLogs.forEach((log: any) => {
    // data: amount, timestamp
    const parsedLog = paymentMadeInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsedLog) {
        dailyRevenue += Number(parsedLog.args.amount) / 1e18;
    }
  });
  
  // NFT trading fees (C2C marketplace fee)
  dailyRevenue += dailyFees;

  // 5. Calculate Daily Volume (C2C trading volume + Payment USDT received)
  let dailyVolume = 0;
  
  // C2C direct sale volume
  itemSoldLogs.forEach((log: any) => {
    const parsedLog = itemSoldInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsedLog) {
        dailyVolume += Number(parsedLog.args.price) / 1e18;
    }
  });
  
  // C2C auction volume
  auctionSettledLogs.forEach((log: any) => {
    const parsedLog = auctionSettledInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsedLog) {
        dailyVolume += Number(parsedLog.args.finalPrice) / 1e18;
    }
  });
  
  // USDT received by Payment pay function (NFT minting)
  paymentLogs.forEach((log: any) => {
    const parsedLog = paymentMadeInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsedLog) {
        dailyVolume += Number(parsedLog.args.amount) / 1e18;
    }
  });

  return {
    dailyFees,    // C2C marketplace 5% platform fee
    dailyRevenue, // NFT minting fees + NFT trading fees
    dailyVolume,  // C2C trading volume + Payment USDT received
  };
}

const methodology = {
  Fees: "C2C marketplace platform fee (5% of NFT trading volume in USDT)",
  Revenue: "NFT minting fees (Payment contract pay function) + NFT trading fees (C2C marketplace 5% platform fee) in USDT",
  Volume: "Total NFT trading volume (C2C marketplace fixed price + auction sales) + NFT minting payments (Payment contract) in USDT",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.OP_BNB]: {
      start: '2025-12-08',
      runAtCurrTime: true,
    }
  },
  methodology,
}

export default adapter;
