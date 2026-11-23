import { PromisePool } from "@supercharge/promise-pool";
import { Interface, zeroPadValue } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getTransactionsWithRetry, getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived } from "../../helpers/token";
import { httpGet } from "../../utils/fetchURL";
import { PHYSICAL_CARD_COSTS } from "../../helpers/physicalCards";

// DYLI production contracts on Abstract; source is DYLI's live production config.
const MAIN_CONTRACT = "0x458422e93bf89a109afc4fac00aacf2f18fcf541";
const MARKETPLACE = "0xC74d5002c10c13D2ad258B4584690829387f84dC";
const TRADING = "0x7627994b4B2d56A05cb2978b813cA0E1ccB22f97";
const PLATFORM_WALLET = "0xfB1302F5D6c5F107a0715b8Ce7303D1e3C647807";
// DYLI vault/warehouse payment wallet on both chains; counts external service-fee inflows and excludes internal sweeps.
// Source: https://abscan.org/address/0x04eaa73b518783010a5A5dc471eEa89C4C34eF44
// Base: https://basescan.org/address/0x04eaa73b518783010a5A5dc471eEa89C4C34eF44
const VAULT_PAYMENT_WALLET = "0x04eaa73b518783010a5A5dc471eEa89C4C34eF44";
// Claim-then-sell helper: transfers the cards to DYLI and pays USDC from the treasury atomically.
// First live sale, 2026-11-05: https://basescan.org/tx/0xfea41735367a7d5e0fc22ad07ca7b0480747cd5a206ff5f5fa8d227c1e644eba
const BASE_SELLBACK_HELPER = "0x4E86614c26f22f3bDDd93AEeE07479159159Fa54"; // https://basescan.org/address/0x4E86614c26f22f3bDDd93AEeE07479159159Fa54#code
// Base cash auctions escrow bids and remit seller proceeds/premiums only on settlement.
// Deployed 2026-11-23: https://basescan.org/tx/0x61b05b139931150fa32b65fd0eb16fc087c18712e200d9b7fde9539bde2afe48
const BASE_AUCTIONS = "0xED6947F6fF6B0C7e861891D3F5F4cAD4D8667834"; // https://basescan.org/address/0xED6947F6fF6B0C7e861891D3F5F4cAD4D8667834#code

const VENDING_MACHINES = [
  "0x92e6f37f41f78b7dd64d9741e2abd304cc3d9f0e",
  "0xbc4dD610d4930fAe06874a546561F4654D603387",
  "0x270Bbb21B1187Bc6e694F428DCb51432958Eb3d9",
];

// DYLI migrated at noon New York time on October 13, 2026 (16:00 UTC).
const MIGRATION_TIMESTAMP = 1791907200;
const CHAIN_CONFIG : any = {
  [CHAIN.ABSTRACT]: {
    chainId: 2741,
    usdc: ADDRESSES.abstract.USDC,
    main: MAIN_CONTRACT,
    marketplace: MARKETPLACE,
    trading: TRADING,
    vendingMachines: VENDING_MACHINES,
    // First block at/after the cutoff: https://abscan.org/block/87554869
    migrationBlock: 87554869,
  },
  [CHAIN.BASE]: {
    chainId: 8453,
    usdc: ADDRESSES.base.USDC,
    // DYLI Base production config; contract source links are listed beside each address.
    main: "0xc9376Fc32bFdbDb039Cc86542F0974d61D127a2A", // https://basescan.org/address/0xc9376Fc32bFdbDb039Cc86542F0974d61D127a2A
    marketplace: "0xb026de341A0f21Cc1BDdF0CC08EFB010A2d37c0d", // https://basescan.org/address/0xb026de341A0f21Cc1BDdF0CC08EFB010A2d37c0d
    trading: "0x6478749AcAA9A77C6c4225668c815A456c7c3492", // https://basescan.org/address/0x6478749AcAA9A77C6c4225668c815A456c7c3492
    vendingMachines: ["0x2f28a653fFfFe4698838BC695c1354023C7b46D2"], // https://basescan.org/address/0x2f28a653fFfFe4698838BC695c1354023C7b46D2
    // First block at/after the cutoff: https://basescan.org/block/52558927
    migrationBlock: 52558927,
  },
};

// DYLI's public payment-evidence endpoint (Stripe sales and Relay bridge origins); returns tx hashes and amounts only.
const EVIDENCE_API = "https://www.dyli.io/api/public/defillama";
// Relay solver: https://docs.relay.link/references/api/api_resources/contract-addresses
const RELAY_SOLVER = "0xf70da97812cb96acdf810712aa562db8dfa3dbef";
const BRIDGE_SOURCE_CHAINS: Record<number, { chain: string; usdc: string }> = {
  1: { chain: CHAIN.ETHEREUM, usdc: ADDRESSES.ethereum.USDC },
  2741: { chain: CHAIN.ABSTRACT, usdc: ADDRESSES.abstract.USDC },
  8453: { chain: CHAIN.BASE, usdc: ADDRESSES.base.USDC },
  // Avalanche treasury bridges are internal funding, not Base service income.
  43114: { chain: CHAIN.AVAX, usdc: ADDRESSES.avax.USDC },
};

const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const ERC20_INTERFACE = new Interface([TRANSFER_EVENT]);
const LISTING_BOUGHT =
  "event ListingBought(uint256 listingId, uint256 tokenId, address buyer, address seller, uint64 amount, uint128 pricePerItem)";
const BID_ACCEPTED =
  "event BidAccepted(uint256 bidId, uint256 tokenId, address seller, address buyer, uint64 amount, uint128 pricePerItem)";
const ORDER_ACCEPTED = "event OrderAccepted(uint256 indexed orderId, address indexed accepter)";
// Base Gacha records both crypto and card/prepaid purchases in Bought.
// https://basescan.org/address/0x2f28a653fFfFe4698838BC695c1354023C7b46D2#code
const BOUGHT = "event Bought(address indexed user, uint256 indexed machineId, bytes32 indexed paymentReference, uint8 paymentMode, uint256 pullCount, uint256 targetBlock, uint256 grossAmount, uint256 onchainCost)";
// Finalized separates genuine sell-backs from refunds; a Claim has no monetary value here.
const FINALIZED = "event Finalized(address indexed user, uint256 indexed machineId, uint256 pullCount, uint256 totalBuyBack, uint256 totalRefund)";
const EXPIRED_BUY_CANCELLED = "event ExpiredBuyCancelled(address indexed user, uint256 indexed machineId, uint256 refund)";
// One aggregate payment per quote; ClaimBought emits per card and must not be summed again.
const BUYBACK_SETTLED = "event BuybackSettled(bytes32 indexed quoteId, address indexed seller, uint256 payout, bytes32 itemsHash)";
const AUCTION_SETTLED = "event Settled(bytes32 indexed id, address indexed recipient, uint256 amount)";
const AUCTION_STATE = "function auctions(bytes32) view returns (address seller, uint256 tokenId, uint256 minimum, uint256 start, uint256 end, address bidder, uint256 bid, uint256 createdBlock, bool settled, bool cancelled, uint256 premiumBps)";
const AUCTION_PREMIUM = "function premium(uint256 amount, uint256 premiumBps) view returns (uint256)";

// Current DYLI production fees; source is DYLI's live production config.
const MARKETPLACE_FEE_BPS = 500n; // 5% secondary marketplace fee.
const TRADE_FEE_BPS = 250n; // 2.5% accepted P2P trade fee.
const BPS_DENOMINATOR = 10_000n;
const CARD_SALES = "Card Sales";
const AUCTION_RECEIPTS = "Auction Fees and Sales";

const normalize = (address?: string | null) => address?.toLowerCase();
const formatError = (error: unknown) => (error instanceof Error ? error.message : String(error));
const getLogFrom = (log: any) => normalize(log.from ?? log.from_address ?? log.args?.from);
const getLogTo = (log: any) => normalize(log.to ?? log.to_address ?? log.args?.to);

const getPaymentLogs = async (options: FetchOptions, usdc: string, targets: string[]) =>
  (await Promise.all(targets.map((target) => options.getLogs({
    target: usdc,
    eventAbi: TRANSFER_EVENT,
    topics: [ERC20_INTERFACE.getEvent("Transfer")!.topicHash, null as any, zeroPadValue(target, 32)],
    onlyArgs: false,
    parseLog: true,
  })))).flat();

const getInternalBridges = async (chainId: number, logs: any[], internal: Set<string | undefined>) => {
  // Evidence lookups run concurrently; any failure fails the fetch.
  const { results } = await PromisePool.withConcurrency(5)
    .for(logs.filter((log) => normalize(log.args.from) === RELAY_SOLVER))
    .handleError((error) => { throw error })
    .process(async (log: any) => {
      const transactionHash = log.transactionHash.toLowerCase();
      const recipient = normalize(log.args.to);
      const data = await httpGet(EVIDENCE_API, { params: { chainId, transactionHash, recipient }, timeout: 30000 });
      if (data.transactionHash !== transactionHash || data.recipient !== recipient || typeof data.internalTransfer !== "boolean")
        throw new Error(`DYLI bridge evidence does not match ${transactionHash}`);
      if (!data.internalTransfer) return;
      const source = BRIDGE_SOURCE_CHAINS[data.sourceChainId];
      if (!source) throw new Error(`DYLI bridge source chain ${data.sourceChainId} is not supported`);
      return { log, source, sourceHash: data.sourceTransactionHash };
    });

  // Source receipts and transactions are fetched in one batch per source chain.
  const bySourceChain: Record<string, any[]> = {};
  for (const bridge of results) if (bridge) (bySourceChain[bridge.source.chain] ??= []).push(bridge);
  const internalBridges = new Set<any>();
  await Promise.all(Object.values(bySourceChain).map(async (bridges) => {
    const { chain, usdc } = bridges[0].source;
    const hashes = bridges.map((bridge) => bridge.sourceHash);
    const [receipts, txs] = await Promise.all([getTxReceiptsWithRetry(chain, hashes), getTransactionsWithRetry(chain, hashes)]);
    bridges.forEach((bridge, i) => {
      const receipt = receipts[i], tx = txs[i];
      const fundedWithUsdc = receipt?.logs.some((sourceLog: any) => normalize(sourceLog.address) === normalize(usdc)
        && internal.has(normalize(ERC20_INTERFACE.parseLog(sourceLog)?.args.from)));
      const fundedWithEth = internal.has(normalize(tx?.from)) && BigInt(tx?.value ?? 0) > 0n;
      if (Number(receipt?.status) !== 1 || !(fundedWithUsdc || fundedWithEth))
        throw new Error(`DYLI bridge source ${bridge.sourceHash} was not funded by DYLI`);
      internalBridges.add(bridge.log);
    });
  }));
  return internalBridges;
};

const getStripeSales = async (options: FetchOptions, boughtLogs: any[], internal: Set<string | undefined>) => {
  const pending = new Map(boughtLogs
    .filter((log) => Number(log.args.paymentMode) === 1 && BigInt(log.args.grossAmount) > 0n && !internal.has(normalize(log.args.user)))
    .map((log) => [String(log.args.paymentReference).toLowerCase(), log]));
  let amount = 0n;
  if (!pending.size) return amount;
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  // The public endpoint caps each request at 43,200 Base blocks.
  for (let from = fromBlock; from <= toBlock; from += 43200) {
    const to = Math.min(toBlock, from + 43199);
    const data = await httpGet(EVIDENCE_API, { params: { chainId: 8453, fromBlock: from, toBlock: to }, timeout: 30000 });
    if (data.version !== 1 || data.chainId !== 8453 || data.fromBlock !== from || data.toBlock !== to ||
        data.complete !== true || !Array.isArray(data.stripeSales)) throw new Error("Incomplete DYLI Stripe evidence");
    for (const sale of data.stripeSales) {
      const log = pending.get(sale.paymentReference);
      if (!log || sale.transactionHash !== log.transactionHash.toLowerCase() || sale.blockNumber !== Number(log.blockNumber) ||
          sale.blockNumber < from || sale.blockNumber > to || sale.grossAmount !== String(log.args.grossAmount) ||
          typeof sale.recognizedAmount !== "string" || !/^\d+$/.test(sale.recognizedAmount) ||
          BigInt(sale.recognizedAmount) > BigInt(log.args.grossAmount))
        throw new Error(`DYLI Stripe sale ${sale.paymentReference} does not match a Bought event`);
      pending.delete(sale.paymentReference); // each purchase counts once
      amount += BigInt(sale.recognizedAmount);
    }
  }
  return amount;
};

/** Add full settled marketplace volume and only DYLI's commission to fees. */
const addMarketplaceLogs = (
  logs: any[],
  dailyVolume: any,
  dailyFees: any,
  usdc: string,
) => {
  for (const log of logs) {
    const args = log.args ?? log;
    const volume = BigInt(args.amount) * BigInt(args.pricePerItem);
    const fees = (volume * MARKETPLACE_FEE_BPS) / BPS_DENOMINATOR;

    dailyVolume.add(usdc, volume);
    dailyFees.add(usdc, fees, METRIC.TRADING_FEES);
  }
};

const fetch = async (originalOptions: FetchOptions) => {
  const config = CHAIN_CONFIG[originalOptions.chain];
  const isBase = originalOptions.chain === CHAIN.BASE;
  const USDC = config.usdc;
  const SERVICE_FEE_TARGETS = [config.main, PLATFORM_WALLET, VAULT_PAYMENT_WALLET];
  const INTERNAL_ADDRESSES = new Set(
    [...SERVICE_FEE_TARGETS, config.marketplace, config.trading, ...config.vendingMachines,
      ...(isBase ? [BASE_SELLBACK_HELPER, BASE_AUCTIONS] : [])].map(normalize),
  );
  const isExternalSender = (log: any) => !INTERNAL_ADDRESSES.has(getLogFrom(log));
  const dailyVolume = originalOptions.createBalances();
  const dailyFees = originalOptions.createBalances();
  const result = () => ({
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  });

  if (isBase && originalOptions.endTimestamp < MIGRATION_TIMESTAMP)
    return result();

  const [originalFromBlock, originalToBlock] = await Promise.all([
    originalOptions.getFromBlock(), originalOptions.getToBlock(),
  ]);
  // Warehouse payments can still arrive on Abstract after contract activity moved to Base.
  if (!isBase && originalToBlock >= config.migrationBlock) {
    const vaultFromBlock = Math.max(originalFromBlock, config.migrationBlock);
    const logs = await getPaymentLogs({
      ...originalOptions,
      getLogs: (params) => originalOptions.getLogs({ ...params, fromBlock: vaultFromBlock, toBlock: originalToBlock }),
    }, USDC, [VAULT_PAYMENT_WALLET]);
    const internalBridges = await getInternalBridges(config.chainId, logs, INTERNAL_ADDRESSES);
    for (const log of logs) {
      if (!isExternalSender(log) || internalBridges.has(log)) continue;
      dailyFees.add(USDC, log.args.value, METRIC.SERVICE_FEES);
      dailyVolume.add(USDC, log.args.value);
    }
  }
  const fromBlock = isBase ? Math.max(originalFromBlock, config.migrationBlock) : originalFromBlock;
  const toBlock = isBase ? originalToBlock : Math.min(originalToBlock, config.migrationBlock - 1);
  if (fromBlock > toBlock) return result();

  // Bound both token-transfer helpers and event queries on the migration day.
  const options: FetchOptions = {
    ...originalOptions,
    getFromBlock: async () => fromBlock,
    getToBlock: async () => toBlock,
    getLogs: (params) => originalOptions.getLogs({ ...params, fromBlock, toBlock }),
  };

  const [listingBoughtLogs, bidAcceptedLogs, orderAcceptedLogs] = await Promise.all([
    options.getLogs({ target: config.marketplace, eventAbi: LISTING_BOUGHT, onlyArgs: false, parseLog: true }),
    options.getLogs({ target: config.marketplace, eventAbi: BID_ACCEPTED, onlyArgs: false, parseLog: true }),
    options.getLogs({ target: config.trading, eventAbi: ORDER_ACCEPTED, entireLog: true }),
  ]);
  const settlementTxs = new Set(
    [...listingBoughtLogs, ...bidAcceptedLogs, ...orderAcceptedLogs].map((log) => log.transactionHash?.toLowerCase()).filter(Boolean),
  );
  const boughtLogs = isBase ? await options.getLogs({
    target: config.vendingMachines[0], eventAbi: BOUGHT, onlyArgs: false, parseLog: true,
  }) : [];

  const getBaseCardPayouts = async () => {
    const sellbacks = options.createBalances();
    const deductions = options.createBalances();
    // These events prove a completed sale/refund. Do not count raw treasury payments,
    // per-card ClaimBought events, initial NFT delivery, or later restocking again.
    const finalized = await options.getLogs({ target: config.vendingMachines[0], eventAbi: FINALIZED });
    for (const log of finalized) {
      if (INTERNAL_ADDRESSES.has(normalize(log.user))) continue;
      sellbacks.add(USDC, log.totalBuyBack);
      deductions.add(USDC, log.totalBuyBack);
      deductions.add(USDC, log.totalRefund);
    }
    const cancelled = await options.getLogs({ target: config.vendingMachines[0], eventAbi: EXPIRED_BUY_CANCELLED });
    for (const log of cancelled) {
      if (!INTERNAL_ADDRESSES.has(normalize(log.user))) deductions.add(USDC, log.refund);
    }
    const settled = await options.getLogs({ target: BASE_SELLBACK_HELPER, eventAbi: BUYBACK_SETTLED });
    for (const log of settled) {
      if (INTERNAL_ADDRESSES.has(normalize(log.seller))) continue;
      sellbacks.add(USDC, log.payout);
      deductions.add(USDC, log.payout);
    }
    return { sellbacks, deductions };
  };

  const getAuctionPayments = async () => {
    const volume = options.createBalances();
    const fees = options.createBalances();
    if (!isBase) return { volume, fees };
    const logs = (await options.getLogs({ target: BASE_AUCTIONS, eventAbi: AUCTION_SETTLED }))
      .filter((log) => BigInt(log.amount) > 0n && !INTERNAL_ADDRESSES.has(normalize(log.recipient)));
    if (!logs.length) return { volume, fees }; // No-bid returns and uncompleted bids are not trades.
    const lots = await options.toApi.multiCall({ target: BASE_AUCTIONS, abi: AUCTION_STATE,
      calls: logs.map((log) => ({ params: [log.id] })) });
    if (lots.length !== logs.length) throw new Error("Incomplete DYLI auction settlement state");
    logs.forEach((log, i) => {
      const lot = lots[i];
      if (!lot || lot[8] !== true || lot[9] !== false || normalize(lot[5]) !== normalize(log.recipient) || BigInt(lot[6]) !== BigInt(log.amount))
        throw new Error("DYLI auction state does not match its settlement");
    });
    const premiums = await options.toApi.multiCall({ target: BASE_AUCTIONS, abi: AUCTION_PREMIUM,
      calls: logs.map((log, i) => ({ params: [log.amount, lots[i][10]] })) });
    if (premiums.length !== logs.length) throw new Error("Incomplete DYLI auction premiums");
    logs.forEach((log, i) => {
      const lot = lots[i];
      // premiumBps is frozen per lot; the onchain function applies its exact cent rounding.
      const hammer = BigInt(log.amount), premium = BigInt(premiums[i]);
      volume.add(USDC, hammer + premium);
      fees.add(USDC, premium);
      if (INTERNAL_ADDRESSES.has(normalize(lot[0]))) fees.add(USDC, hammer);
    });
    return { volume, fees };
  };

  const getServiceFeeInflows = async () => {
    if (!isBase) return addTokensReceived({ options, targets: SERVICE_FEE_TARGETS, token: USDC, logFilter: isExternalSender });
    const balances = options.createBalances();
    // Base commissions go directly from users to the payment wallet; count them under trading fees once.
    const logs = await getPaymentLogs(options, USDC, SERVICE_FEE_TARGETS);
    const internalBridges = await getInternalBridges(config.chainId, logs, INTERNAL_ADDRESSES);
    for (const log of logs) {
      const isCommission = getLogTo(log) === normalize(PLATFORM_WALLET)
        && settlementTxs.has(log.transactionHash?.toLowerCase());
      if (isExternalSender(log) && !isCommission && !internalBridges.has(log))
        balances.add(USDC, log.args.value);
    }
    return balances;
  };

  const getCardSaleInflows = async () => {
    if (!isBase) return addTokensReceived({ options, targets: config.vendingMachines, token: USDC, logFilter: isExternalSender });
    const sales = options.createBalances();
    for (const log of boughtLogs) {
      if (!INTERNAL_ADDRESSES.has(normalize(log.args.user))) sales.add(USDC, log.args.onchainCost);
    }
    sales.add(USDC, await getStripeSales(options, boughtLogs, INTERNAL_ADDRESSES));
    return sales;
  };

  const [serviceFeeInflows, cardSaleInflows, cardPayouts, auctionPayments] = await Promise.all([
    getServiceFeeInflows(),
    getCardSaleInflows(),
    isBase ? getBaseCardPayouts() : addTokensReceived({
      options,
      fromAdddesses: config.vendingMachines,
      token: USDC,
      logFilter: (log) => {
        const to = getLogTo(log);
        return !to || !INTERNAL_ADDRESSES.has(to);
      },
      // Legacy outflows combine buybacks and refunds; retain the fee deduction only.
    }).then((outflows) => ({ sellbacks: options.createBalances(), deductions: outflows })),
    getAuctionPayments(),
  ]);

  const serviceFees = serviceFeeInflows.clone(1, METRIC.SERVICE_FEES);
  const cardSales = cardSaleInflows.clone(1, CARD_SALES);

  // Gross payment/trading turnover: a purchase and a later sell-back are two
  // distinct settled trades. Refunds are not another trade and never add volume.
  dailyVolume.add(serviceFeeInflows);
  dailyVolume.add(cardSaleInflows);
  dailyVolume.add(cardPayouts.sellbacks);
  dailyVolume.add(auctionPayments.volume);

  dailyFees.add(serviceFees, METRIC.SERVICE_FEES);
  dailyFees.add(cardSales, CARD_SALES);
  // Physical TCG fees are net of sell-backs and refunds under the same label.
  dailyFees.subtract(cardPayouts.deductions, CARD_SALES);
  dailyFees.add(auctionPayments.fees, AUCTION_RECEIPTS);

  addMarketplaceLogs(listingBoughtLogs, dailyVolume, dailyFees, USDC);
  addMarketplaceLogs(bidAcceptedLogs, dailyVolume, dailyFees, USDC);

  const acceptedTradeTxHashes = [
    ...new Set(
      orderAcceptedLogs.map((log: any) => log.transactionHash?.toLowerCase()).filter(Boolean),
    ),
  ];

  let tradingVolume = 0n;
  let baseTradingFees = 0n;
  if (acceptedTradeTxHashes.length) {
    let receipts;
    try {
      receipts = await getTxReceiptsWithRetry(options.chain, acceptedTradeTxHashes);
      if (receipts.some((receipt) => !receipt))
        throw new Error("Accepted-trade receipts are still missing after retries");
    } catch (error) {
      throw new Error(`Failed to fetch DYLI P2P trade receipts: ${formatError(error)}`);
    }

    const platformWallet = normalize(PLATFORM_WALLET);
    const usdc = normalize(USDC);

    for (const receipt of receipts) {
      for (const log of receipt?.logs ?? []) {
        if (normalize(log.address) !== usdc) continue;

        const parsedLog = ERC20_INTERFACE.parseLog({
          topics: log.topics ?? [],
          data: log.data ?? "0x",
        });
        if (!parsedLog || parsedLog.name !== "Transfer") continue;
        if (normalize(parsedLog.args.to) === platformWallet) {
          if (!isBase || !isExternalSender(parsedLog)) continue;
          baseTradingFees += BigInt(parsedLog.args.value);
        }
        tradingVolume += BigInt(parsedLog.args.value);
      }
    }
  }

  if (tradingVolume > 0n) {
    const tradingFees = isBase ? baseTradingFees : (tradingVolume * TRADE_FEE_BPS) / BPS_DENOMINATOR;
    dailyVolume.add(USDC, tradingVolume);
    dailyFees.add(USDC, tradingFees, METRIC.TRADING_FEES);
  }

  return result();
};

const methodology = {
  Volume:
    "Gross tracked payment/trading turnover: paid purchases, verified Stripe-funded Base Gacha purchases, full marketplace/P2P settlements, settled cash auctions including buyer premiums and Base sell-backs to DYLI, plus tracked service receipts; excludes treasury funding, internal bridges, NFT claims/restocking, uncompleted bids and refund payouts, and is not pack-only GMV.",
  Fees:
    "Tracked service receipts, marketplace/P2P commissions, settled cash-auction premiums and DYLI-owned auction sales, plus crypto/verified Stripe Gacha purchases net of sell-backs to DYLI and refunds; Base includes direct and claim-then-sell payouts, allows negative periods and excludes other offchain sales and diamond auctions.",
  UserFees: "Tracked service payments, marketplace/P2P commissions and settled cash-auction income, plus crypto/verified Stripe pack receipts after sell-backs and refunds; excludes internal funding and unverified offchain sales.",
  Revenue: "Tracked service receipts, marketplace/P2P commissions, cash-auction premiums and DYLI-owned auction sales, plus crypto/verified Stripe Gacha purchases retained after sell-backs and refunds, before undisclosed offchain card procurement, grading, shipping and vaulting costs.",
  ProtocolRevenue: "Tracked service receipts, marketplace/P2P commissions, cash-auction premiums and DYLI-owned auction sales, plus crypto/verified Stripe Gacha purchases allocated to DYLI after sell-backs and refunds, before undisclosed offchain physical-card costs.",
};

const feeBreakdown = {
  [METRIC.SERVICE_FEES]: "USDC transfers into DYLI mint, platform-wallet, vault-payment, and batchRedeem fee paths, including nonrefundable cash-auction launch charges.",
  [CARD_SALES]: "Crypto and verified Stripe pack receipts net of sell-backs to DYLI and refunds; includes treasury-funded BuybackSettled payouts once per quote, not again per ClaimBought card.",
  [METRIC.TRADING_FEES]: "5% of secondary marketplace volume; P2P fees are 2.5% of accepted trade USDC volume on Abstract and the USDC paid to the DYLI platform wallet in accepted trades on Base.",
  [AUCTION_RECEIPTS]: "Settled cash-auction buyer premiums, plus the hammer price when DYLI is the seller; each lot uses its frozen onchain rate and cent rounding, excluding external seller proceeds and bid/refund escrow.",
};

const breakdownMethodology = {
  Fees: feeBreakdown,
  UserFees: feeBreakdown,
  Revenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    [CARD_SALES]: "Crypto and verified Stripe pack receipts retained by DYLI after sell-backs and refunds, before undisclosed offchain physical-card costs.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
    [AUCTION_RECEIPTS]: "Cash-auction buyer premiums and DYLI-owned hammer-price receipts retained at settlement, before undisclosed physical-card costs; launch charges remain under Service Fees.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    [CARD_SALES]: "Crypto and verified Stripe pack receipts allocated to DYLI after sell-backs and refunds, before undisclosed offchain physical-card costs.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
    [AUCTION_RECEIPTS]: "Cash-auction buyer premiums and DYLI-owned hammer-price receipts allocated to DYLI at settlement, before undisclosed physical-card costs.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ABSTRACT]: { fetch, start: "2025-10-05" },
    [CHAIN.BASE]: { fetch, start: "2026-10-13" },
  },
  methodology,
  breakdownMethodology,
  unknownBreakdownMethodology: PHYSICAL_CARD_COSTS,
  allowNegativeValue: true, // buybacks in this period can cover sales from prior periods, so net fees may be negative
};

export default adapter;
