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

// Current DYLI production fees; source is DYLI's live production config.
const MARKETPLACE_FEE_BPS = 500n; // 5% secondary marketplace fee.
const TRADE_FEE_BPS = 250n; // 2.5% accepted P2P trade fee.
const BPS_DENOMINATOR = 10_000n;
const CARD_SALES = "Card Sales";
const CARD_BUYBACK_SPENDS = "Card Buyback Spends";

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
  // The endpoint caps a request at one day of Base blocks (2s block time).
  for (let from = fromBlock; from <= toBlock; from += 43200) {
    const to = Math.min(toBlock, from + 43199);
    const data = await httpGet(EVIDENCE_API, { params: { chainId: 8453, fromBlock: from, toBlock: to }, timeout: 30000 });
    if (data.complete !== true || !Array.isArray(data.stripeSales)) throw new Error("Incomplete DYLI Stripe evidence");
    for (const sale of data.stripeSales) {
      const log = pending.get(sale.paymentReference);
      const recognized = BigInt(sale.recognizedAmount);
      if (!log || sale.transactionHash !== log.transactionHash.toLowerCase() || recognized < 0n || recognized > BigInt(log.args.grossAmount))
        throw new Error(`DYLI Stripe sale ${sale.paymentReference} does not match a Bought event`);
      pending.delete(sale.paymentReference); // each purchase counts once
      amount += recognized;
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
    [...SERVICE_FEE_TARGETS, config.marketplace, config.trading, ...config.vendingMachines].map(normalize),
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

  const [serviceFeeInflows, cardSaleInflows, cardBuybackOutflows] = await Promise.all([
    getServiceFeeInflows(),
    getCardSaleInflows(),
    addTokensReceived({
      options,
      fromAdddesses: config.vendingMachines,
      token: USDC,
      logFilter: (log) => {
        const to = getLogTo(log);
        return !to || !INTERNAL_ADDRESSES.has(to);
      },
    }),
  ]);

  const serviceFees = serviceFeeInflows.clone(1, METRIC.SERVICE_FEES);
  const cardSales = cardSaleInflows.clone(1, CARD_SALES);
  const cardBuybacks = cardBuybackOutflows.clone(-1, CARD_BUYBACK_SPENDS);

  dailyVolume.add(serviceFees);
  dailyVolume.add(cardSales);

  dailyFees.add(serviceFees, METRIC.SERVICE_FEES);
  dailyFees.add(cardSales, CARD_SALES);
  dailyFees.add(cardBuybacks, CARD_BUYBACK_SPENDS);

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
    "USDC payments into DYLI mint, vending-machine, platform-wallet, vault-payment, and batchRedeem paths, plus verified Stripe-funded Base Gacha purchases and marketplace/P2P settlement volume. Internal treasury bridges and vending-machine funding are excluded.",
  Fees:
    "USDC service payments and Gacha sales, including verified Stripe-funded Base purchases, after subtracting vending-machine buybacks and refunds, plus 5% marketplace fees. Base crypto sales use Bought.onchainCost; Stripe sales are matched to onchain Bought events using public payment evidence. P2P fees are 2.5% of volume on Abstract and actual platform-wallet commissions on Base. Contracts switch from Abstract to Base on October 13, 2026 at 16:00 UTC; Abstract vault-payment receipts remain tracked afterward. Other offchain sales are excluded.",
  Revenue: "Onchain USDC fees and payment flows retained by DYLI.",
  ProtocolRevenue: "Onchain USDC fees and payment flows retained by DYLI.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "USDC transfers into DYLI mint, platform-wallet, vault-payment, and batchRedeem fee paths.",
    [CARD_SALES]: "Crypto pack purchases and verified Stripe-funded Base purchases, matched to Bought events without counting prepaid crypto receipts twice.",
    [CARD_BUYBACK_SPENDS]: "USDC paid for vending-machine buybacks and refunds, including payouts from Stripe-funded purchases.",
    [METRIC.TRADING_FEES]: "5% of secondary marketplace volume; P2P fees are 2.5% of accepted trade USDC volume on Abstract and the USDC paid to the DYLI platform wallet in accepted trades on Base.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    [CARD_SALES]: "Crypto and verified Stripe-funded Base pack purchases retained by DYLI before buybacks and refunds.",
    [CARD_BUYBACK_SPENDS]: "USDC spent by the protocol on card buybacks (vending-machine buybacks) spent by DYLI.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    [CARD_SALES]: "Crypto and verified Stripe-funded Base pack purchases retained by DYLI before buybacks and refunds.",
    [CARD_BUYBACK_SPENDS]: "USDC spent by the protocol on card buybacks (vending-machine buybacks) spent by DYLI.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
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
