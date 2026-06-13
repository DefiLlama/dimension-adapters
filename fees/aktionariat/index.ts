import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BPS_DENOMINATOR = 10000n;
const AKTIONARIAT_LICENSE_FEE_RECIPIENT = "0x29fe8914e76da5ce2d90de98a64d0055f199d06d";

const MARKET_BROKERBOT_START_BLOCK = 11997227;
const SECONDARY_MARKET_START_BLOCK = 23434185;

const marketBrokerbotTradeEvent =
  "event Trade(address indexed token, address who, bytes ref, int256 amount, address base, uint256 totPrice, uint256 fee, uint256 newprice)";

const secondaryMarketSources = [
  {
    fromBlock: SECONDARY_MARKET_START_BLOCK,
    factories: [
      "0x6ca997b442bc9cbd6ed21a7d326191353f3610c0",
      "0x14e68a822d3313f6b2e4eb71ff18aef3b4479c04",
    ],
    deployedEvent: "event SecondaryMarketDeployed(address indexed owner, address market, address router)",
    tradeEvent:
      "event Trade(address indexed seller, address indexed buyer, address token, uint256 tokenAmount, address currency, uint256 currencyAmount, uint256 fees)",
  },
  {
    fromBlock: SECONDARY_MARKET_START_BLOCK,
    factories: [
      "0xca7a7c48a31f8e99a325fd0c56eeee4b0f843e4f",
      "0xf01602a7cff0f5c71bb53e145525abfcb3048fee",
      "0x08c2cb730dc666dd6487667b1d66ba9ef5fe71d4",
    ],
    deployedEvent: "event SecondaryMarketDeployed(address indexed owner, address market)",
    tradeEvent:
      "event Trade(address indexed seller, address indexed buyer, bytes32 sellIntentHash, bytes32 buyIntentHash, address token, uint256 tokenAmount, address currency, uint256 currencyAmount, uint256 fees)",
  },
];

const metrics = {
  marketBrokerbotLicenseFees: "Market/Brokerbot License Fees",
  marketBrokerbotLicenseFeesToAktionariat: "Market/Brokerbot License Fees To Aktionariat",
  secondaryMarketTradingFees: "Secondary Market Trading Fees",
  secondaryMarketTradingFeesToAktionariat: "Secondary Market Trading Fees To Aktionariat",
  secondaryMarketTradingFeesToMarketOwners: "Secondary Market Trading Fees To Market Owners/Issuers",
};

const getSecondaryMarketGroups = async (options: FetchOptions, toBlock: number) => {
  const groups = [];

  for (const source of secondaryMarketSources) {
    if (toBlock < source.fromBlock) continue;

    const deploymentLogs = await options.getLogs({
      targets: source.factories,
      fromBlock: source.fromBlock,
      toBlock,
      eventAbi: source.deployedEvent,
      cacheInCloud: true,
    });

    groups.push({
      tradeEvent: source.tradeEvent,
      markets: Array.from(
        new Set(deploymentLogs.map((log: any) => log.market?.toLowerCase()).filter(Boolean))
      ),
    });
  }

  const markets = Array.from(new Set(groups.flatMap(({ markets }) => markets)));
  if (!markets.length) return { groups, licenseShareByMarket: new Map<string, bigint>() };

  const [licenseShares, licenseFeeRecipients] = await Promise.all([
    options.api.multiCall({ abi: "uint16:licenseShare", calls: markets, permitFailure: true }),
    options.api.multiCall({ abi: "address:LICENSE_FEE_RECIPIENT", calls: markets, permitFailure: true }),
  ]);

  const licenseShareByMarket = new Map<string, bigint>();
  const validMarkets = new Set<string>();

  markets.forEach((market, index) => {
    if ((licenseFeeRecipients[index] || "").toLowerCase() !== AKTIONARIAT_LICENSE_FEE_RECIPIENT) return;
    if (licenseShares[index] === null || licenseShares[index] === undefined) return;

    const licenseShare = BigInt(licenseShares[index]);
    if (licenseShare < 0n || licenseShare > BPS_DENOMINATOR) return;

    validMarkets.add(market);
    licenseShareByMarket.set(market, licenseShare);
  });

  return {
    groups: groups.map((group) => ({
      ...group,
      markets: group.markets.filter((market) => validMarkets.has(market)),
    })),
    licenseShareByMarket,
  };
};

const addSecondaryMarketFees = async (
  options: FetchOptions,
  groups: { tradeEvent: string; markets: string[] }[],
  licenseShareByMarket: Map<string, bigint>,
  dailyFees: any,
  dailyUserFees: any,
  dailyRevenue: any,
  dailyProtocolRevenue: any,
  dailySupplySideRevenue: any,
) => {
  for (const { tradeEvent, markets } of groups) {
    if (!markets.length) continue;

    const tradeLogs = await options.getLogs({
      targets: markets,
      eventAbi: tradeEvent,
      entireLog: true,
      parseLog: true,
    });

    const feesByMarketCurrency = new Map<string, { market: string; currency: string; fee: bigint }>();
    for (const log of tradeLogs) {
      const fee = BigInt(log.args.fees || 0);
      if (fee === 0n) continue;

      const market = log.address.toLowerCase();
      const currency = log.args.currency?.toLowerCase();
      if (!currency) continue;

      const key = `${market}:${currency}`;
      const entry = feesByMarketCurrency.get(key) || { market, currency, fee: 0n };
      entry.fee += fee;
      feesByMarketCurrency.set(key, entry);
    }

    for (const { market, currency, fee } of feesByMarketCurrency.values()) {
      const licenseShare = licenseShareByMarket.get(market);
      if (licenseShare === undefined) throw new Error(`Missing license share for market ${market}`);

      const revenue = fee * licenseShare / BPS_DENOMINATOR;
      const supplySideRevenue = fee - revenue;

      dailyFees.add(currency, fee, metrics.secondaryMarketTradingFees);
      dailyUserFees.add(currency, fee, metrics.secondaryMarketTradingFees);
      dailyRevenue.add(currency, revenue, metrics.secondaryMarketTradingFeesToAktionariat);
      dailyProtocolRevenue.add(currency, revenue, metrics.secondaryMarketTradingFeesToAktionariat);
      dailySupplySideRevenue.add(currency, supplySideRevenue, metrics.secondaryMarketTradingFeesToMarketOwners);
    }
  }
};

const addMarketBrokerbotFees = async (
  options: FetchOptions,
  dailyFees: any,
  dailyUserFees: any,
  dailyRevenue: any,
  dailyProtocolRevenue: any,
) => {
  const toBlock = await options.getToBlock();
  if (toBlock < MARKET_BROKERBOT_START_BLOCK) return;

  const tradeLogs = await options.getLogs({
    fromBlock: Math.max(await options.getFromBlock(), MARKET_BROKERBOT_START_BLOCK),
    eventAbi: marketBrokerbotTradeEvent,
    noTarget: true,
    entireLog: true,
    parseLog: true,
  });

  const feesByMarketCurrency = new Map<string, { market: string; currency: string; fee: bigint }>();
  for (const log of tradeLogs) {
    const fee = BigInt(log.args.fee || 0);
    if (fee === 0n) continue;

    const market = log.address.toLowerCase();
    const currency = log.args.base?.toLowerCase();
    if (!currency) continue;

    const key = `${market}:${currency}`;
    const entry = feesByMarketCurrency.get(key) || { market, currency, fee: 0n };
    entry.fee += fee;
    feesByMarketCurrency.set(key, entry);
  }

  const markets = Array.from(new Set(Array.from(feesByMarketCurrency.values()).map(({ market }) => market)));
  if (!markets.length) return;

  const copyrightRecipients = await options.api.multiCall({ abi: "address:copyright", calls: markets, permitFailure: true });
  const validMarkets = new Set(
    markets.filter((market, index) =>
      (copyrightRecipients[index] || "").toLowerCase() === AKTIONARIAT_LICENSE_FEE_RECIPIENT
    )
  );

  for (const { market, currency, fee } of feesByMarketCurrency.values()) {
    if (!validMarkets.has(market)) continue;

    dailyFees.add(currency, fee, metrics.marketBrokerbotLicenseFees);
    dailyUserFees.add(currency, fee, metrics.marketBrokerbotLicenseFees);
    dailyRevenue.add(currency, fee, metrics.marketBrokerbotLicenseFeesToAktionariat);
    dailyProtocolRevenue.add(currency, fee, metrics.marketBrokerbotLicenseFeesToAktionariat);
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const toBlock = await options.getToBlock();

  await addMarketBrokerbotFees(options, dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue);

  const { groups, licenseShareByMarket } = await getSecondaryMarketGroups(options, toBlock);
  await addSecondaryMarketFees(
    options,
    groups,
    licenseShareByMarket,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  );

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2021-03-08",
  pullHourly: true,
  methodology: {
    Fees: "Trading fees emitted by Ethereum Aktionariat Market/Brokerbot contracts and SecondaryMarket contracts. Market/Brokerbot contracts are filtered by copyright(), and SecondaryMarket contracts are discovered from known old/current factory deployment events.",
    UserFees: "Trading fees paid by Ethereum Market/Brokerbot and SecondaryMarket traders.",
    Revenue: "Market/Brokerbot license fees plus the Aktionariat license-share portion of Ethereum SecondaryMarket trading fees, attributed from each market's licenseShare() at the hourly slice block.",
    ProtocolRevenue: "Equal to revenue.",
    SupplySideRevenue: "The remaining Ethereum SecondaryMarket trading fee share attributed to market owners/issuers.",
  },
  breakdownMethodology: {
    Fees: {
      [metrics.marketBrokerbotLicenseFees]: "License fees emitted by Aktionariat Market/Brokerbot Trade events, filtered by copyright(). Old XCHF is counted as the emitted token and is not mapped to another asset.",
      [metrics.secondaryMarketTradingFees]: "Trading fees emitted by Ethereum Aktionariat SecondaryMarket Trade events.",
    },
    UserFees: {
      [metrics.marketBrokerbotLicenseFees]: "Market/Brokerbot license fees paid by traders.",
      [metrics.secondaryMarketTradingFees]: "Ethereum SecondaryMarket Trade event fees paid by traders.",
    },
    Revenue: {
      [metrics.marketBrokerbotLicenseFeesToAktionariat]: "Market/Brokerbot license fees attributed to Aktionariat's copyright recipient.",
      [metrics.secondaryMarketTradingFeesToAktionariat]: "The license-share portion of Ethereum SecondaryMarket trading fees attributed to Aktionariat's license fee recipient.",
    },
    ProtocolRevenue: {
      [metrics.marketBrokerbotLicenseFeesToAktionariat]: "Market/Brokerbot license fees attributed to Aktionariat's copyright recipient.",
      [metrics.secondaryMarketTradingFeesToAktionariat]: "The license-share portion of Ethereum SecondaryMarket trading fees attributed to Aktionariat's license fee recipient.",
    },
    SupplySideRevenue: {
      [metrics.secondaryMarketTradingFeesToMarketOwners]: "The remaining Ethereum SecondaryMarket trading fee share attributed to the market owner/issuer.",
    },
  },
};

export default adapter;
