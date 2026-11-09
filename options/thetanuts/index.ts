import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const R13_BOOK = "0x039bD7Bb12Ff5854DA226F738FAD372C508A0b2F";
const R13_FACTORY = "0x06B19C26d5F42bd98a2Df2A25BB784B9E8CeaD89";

type ChainConfig = { books9: string[]; books8: string[]; books7: string[]; factories: string[]; start: string };

const config: Record<string, ChainConfig> = {
  [CHAIN.BASE]: {
    books9: ["0xd58b814C7Ce700f251722b5555e25aE0fa8169A1", "0x1bDff855d6811728acaDC00989e79143a2bdfDed", R13_BOOK],
    books8: ["0x1fcA1052F45A3271F12221D4D990BfED4EE7D0b1"],
    books7: ["0x271Ec67b7f5655317154E718C16FD9748F300D2D", "0x5800c76b27365C0eDf1cb981E7a2281d48fa096D", "0xA63D2717538834E553cbe811B04a17eC748D71FB"],
    factories: [
      "0xB8656F97F98b7edc47a966790FF468539Cec1617",
      "0xfBFF39cba579F66Ac4F9060631dce92d8d92D407",
      "0xB5c100c71b46507Df3e7426a179201a574B8b636",
      "0x1df869899C1F0f88CE2397B6770C7dCb0C249b27",
      "0x1aDcD391CF15Fb699Ed29B1D394F4A64106886e5",
      "0x115DAADE1B6AE413FD136f6cc24c6Cd5592E670b",
      "0x340ceF2EFEbeF1A1c9500B38cD4945a77c31603D",
      "0x1D1Fee494dDEAF32626dcd50e0Cd83890574730f",
      "0x8118daD971dEbffB49B9280047659174128A8B94",
      R13_FACTORY,
    ],
    start: "2025-01-20",
  },
  [CHAIN.ETHEREUM]: { books9: [R13_BOOK], books8: [], books7: [], factories: [R13_FACTORY], start: "2026-08-19" },
  [CHAIN.ROBINHOOD]: { books9: [R13_BOOK], books8: [], books7: [], factories: [R13_FACTORY], start: "2026-09-23" },
};

const ORDER_FILLED_9 =
  "event OrderFilled(uint256 indexed nonce, address indexed buyer, address indexed seller, address optionAddress, uint256 premiumAmount, uint256 feeCollected, address referrer, uint256 referralFeePaid, bool sellerWasMaker)";
const ORDER_FILLED_8 =
  "event OrderFilled(uint256 indexed nonce, address indexed buyer, address indexed seller, address optionAddress, uint256 premiumAmount, uint256 feeCollected, uint256 referralFeePaid, bool sellerWasMaker)";
const ORDER_FILLED_7 =
  "event OrderFilled(uint256 indexed nonce, address indexed buyer, address indexed seller, address optionAddress, uint256 premiumAmount, uint256 feeCollected, bool sellerWasMaker)";
const QUOTATION_SETTLED =
  "event QuotationSettled(uint256 indexed quotationId, address indexed requester, address indexed winner, address optionAddress)";
const PREMIUM_PAID = "event PremiumPaid(uint256 indexed quotationId, address indexed recipient, uint256 amount)";
const FEE_PAID = "event FeePaid(uint256 indexed quotationId, uint256 amount)";
const OFFER_FROM_BOOK =
  "event OfferAcceptedFromOrderBook(uint256 indexed quotationId, address indexed maker, uint256 premiumAmount, address optionAddress)";
const OPTION_INITIALIZED =
  "event OptionInitialized(address indexed buyer, address indexed seller, address indexed createdBy, uint256 optionType, address collateralToken, address priceFeed, uint256[] strikes, uint256 expiryTimestamp, uint256 numContracts, uint256 collateralAmount, bytes extraOptionData)";
const GET_STRIKES = "function getStrikes() view returns (uint256[])";

const QUOTATIONS =
  "function quotations(uint256) view returns ((address requester, address existingOptionAddress, address collateral, address collateralPriceFeed, address implementation, uint256[] strikes, uint256 numContracts, uint256 requesterDeposit, uint256 collateralAmount, uint256 expiryTimestamp, uint256 offerEndTimestamp, bool isRequestingLongPosition, bool convertToLimitOrder, bytes extraOptionData), (bool isActive, address currentWinner, uint256 currentBestPriceOrReserve, uint256 feeCollected, address optionContract))";

type OptionInfo = { token: string; contracts: bigint; collateral: bigint; strikes: bigint[] };
type Trade = { premium: bigint; info: OptionInfo };


const fetch = async (options: FetchOptions) => {
  const cfg = config[options.chain];
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const trades: Trade[] = [];
  const bookFills: { option: string; premium: bigint }[] = [];

  for (const [targets, eventAbi] of [[cfg.books9, ORDER_FILLED_9], [cfg.books8, ORDER_FILLED_8], [cfg.books7, ORDER_FILLED_7]] as [string[], string][]) {
    if (!targets.length) continue;
    const fills = await options.getLogs({ targets, eventAbi });
    for (const fill of fills) bookFills.push({ option: fill.optionAddress, premium: BigInt(fill.premiumAmount) });
  }

  if (cfg.factories.length) {
    const [settled, paid, fees, fromBook] = await Promise.all([
      options.getLogs({ targets: cfg.factories, eventAbi: QUOTATION_SETTLED, entireLog: true }),
      options.getLogs({ targets: cfg.factories, eventAbi: PREMIUM_PAID, entireLog: true }),
      options.getLogs({ targets: cfg.factories, eventAbi: FEE_PAID, entireLog: true }),
      options.getLogs({ targets: cfg.factories, eventAbi: OFFER_FROM_BOOK }),
    ]);
    const key = (log: any) => `${log.address.toLowerCase()}:${log.args.quotationId}`;
    const premiumByRfq = new Map<string, bigint>();
    for (const log of [...paid, ...fees]) premiumByRfq.set(key(log), (premiumByRfq.get(key(log)) ?? 0n) + BigInt(log.args.amount));
    const filledOnBook = new Set(fromBook.map((log: any) => log.optionAddress.toLowerCase()));
    const rfqs = settled.filter((log: any) => !filledOnBook.has(log.args.optionAddress.toLowerCase()));
    const quotes = await options.api.multiCall({ abi: QUOTATIONS, calls: rfqs.map((log: any) => ({ target: log.address, params: [log.args.quotationId] })) });
    rfqs.forEach((log: any, i: number) => {
      const premium = premiumByRfq.get(key(log));
      if (premium === undefined) throw new Error(`no premium for rfq ${key(log)}`);
      const p = quotes[i][0];
      trades.push({ premium, info: { token: p.collateral, contracts: BigInt(p.numContracts), collateral: BigInt(p.collateralAmount), strikes: p.strikes.map((x: any) => BigInt(x)) } });
    });
  }

  if (bookFills.length) {
    const optionAddresses = [...new Set(bookFills.map((f) => f.option.toLowerCase()))];
    const info = new Map<string, OptionInfo>();
    const inits = await options.getLogs({ targets: optionAddresses, eventAbi: OPTION_INITIALIZED, entireLog: true });
    for (const log of inits) {
      info.set(log.address.toLowerCase(), { token: log.args.collateralToken, contracts: BigInt(log.args.numContracts), collateral: BigInt(log.args.collateralAmount), strikes: log.args.strikes.map((x: any) => BigInt(x)) });
    }
    const missing = optionAddresses.filter((a) => !info.has(a));
    if (missing.length) {
      const [tokens, contracts, collateral, strikes] = await Promise.all([
        options.api.multiCall({ abi: "address:collateralToken", calls: missing }),
        options.api.multiCall({ abi: "uint256:numContracts", calls: missing }),
        options.api.multiCall({ abi: "uint256:collateralAmount", calls: missing }),
        options.api.multiCall({ abi: GET_STRIKES, calls: missing }),
      ]);
      missing.forEach((a, i) => {
        if (/^0x0{40}$/i.test(tokens[i]) || !strikes[i].length) throw new Error(`no option data for ${a}`);
        info.set(a, { token: tokens[i], contracts: BigInt(contracts[i]), collateral: BigInt(collateral[i]), strikes: strikes[i].map((x: any) => BigInt(x)) });
      });
    }
    for (const fill of bookFills) trades.push({ premium: fill.premium, info: info.get(fill.option.toLowerCase())! });
  }

  if (!trades.length) return { dailyNotionalVolume, dailyPremiumVolume };

  const tokens = [...new Set(trades.map((t) => t.info.token.toLowerCase()))];
  const decimalsList = await options.api.multiCall({ abi: "erc20:decimals", calls: tokens });
  const decimals = new Map(tokens.map((t, i) => [t, Number(decimalsList[i])]));

  for (const { premium, info } of trades) {
    if (!info.strikes.length) throw new Error("option without strikes");
    dailyPremiumVolume.add(info.token, premium);
    if (info.strikes.length === 1) {
      dailyNotionalVolume.addUSDValue(Number(info.contracts * info.strikes[0]) / 1e8 / 10 ** decimals.get(info.token.toLowerCase())!);
    } else {
      dailyNotionalVolume.add(info.token, info.collateral);
    }
  }

  return { dailyNotionalVolume, dailyPremiumVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: config,
  fetch,
  methodology: {
    NotionalVolume:
      "Underlying value of options traded on Thetanuts through the OptionBook and through settled OptionFactory RFQs, including loan and collar RFQs, counted as contracts times strike for single-strike options and as collateral for spreads, butterflies and condors.",
    PremiumVolume: "Premium paid by option buyers on OptionBook fills and on settled OptionFactory RFQs, including the protocol fee.",
  },
};

export default adapter;
