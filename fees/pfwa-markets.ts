import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { PFWA_PROTOCOL_WALLETS, PfwaSell, getPfwaLiveFactories, getPfwaMarketTrades } from "../helpers/pfwa-markets";

// PFWA Markets (https://pfwa.fun, https://x.com/pfwafun): prediction markets on Robinhood Chain where every outcome is
// its own bonding-curve token, traded with native ETH. Contracts and events: helpers/pfwa-markets.ts. Fee rules, from
// the verified BondingCurveToken and PFWAMarketFactory sources:
// - Buy: the trader pays feePercentage (per mille) on top of the curve cost twice: once to the token's creator, once
//   to the token's platform (the PFWA treasury). Both are set when the factory deploys the token and never change.
//   Markets the relayer creates name the treasury as their creator, so on those both legs reach the treasury. The
//   amounts come from FeeDistributed.
// - Sell before the market's deadline: an early-sell penalty of sellFeePercentage per mille of the proceeds (set at
//   deployment, never changed), half to the treasury and half to the market's bonus pot, which goes to the winning side
//   at resolution. v1 markets only trade before their deadline, so every v1 sell pays it.
// - Sell after the deadline (v2 markets, once the post-deadline grace period is over): the buy fee again, to the
//   creator and to the treasury. feePercentage can be lowered later (factory setFeeForMarket, by the market's creator
//   or the owner, no event); it is read at the window's end block. No v2 outcome token's fee has changed since launch
//   (6-hourly samples of all 230 tokens, 2026-08-31 to 2026-10-16).
// - Creating a market (createMarket, not the relayer's free createRelayerMarket) costs marketCreationFee. v1 sends all
//   of it to the treasury; v2 sends buybackBurnPercentage (in bps) of it through WETH into the 1% WETH/PFWA Uniswap v3
//   pool and transfers the $PFWA bought to the dead address, and the rest to the treasury. Both settings can change
//   (setCreationFee, setBuybackBurnPercentage, which emit no events); they are read at the window's end block. The v2
//   creation fee changed twice (0.005 to 0.0025 ETH on 2026-09-02 20:46 UTC, to 0.001 ETH on 2026-09-10 21:19 UTC),
//   with no paid creation earlier in either hour; buybackBurnPercentage has stayed 5000.
// Trades and paid market creations by PFWA's own wallets are excluded (helpers/pfwa-markets.ts).

const PFWA = "0xa934bA4F59070149d37A93F8A002Af79BAe35563";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const WETH = ADDRESSES.robinhood.WETH;
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MARKET_CREATED = "event MarketCreated(uint256 indexed marketId, uint8 indexed marketType, string name, uint256 expirationTime, address creator, address[] optionTokens)";
const toTopic = (address: string) => "0x" + address.toLowerCase().replace("0x", "").padStart(64, "0");

type Uint = bigint | string | number;
type MarketCreatedLog = { transactionHash: string; args: { creator: string; optionTokens: string[] } };
type TransferLog = { transactionHash: string; args: { from: string; to: string; value: Uint } };

const L = {
  TRADING_FEES: "Trading Fees",
  EARLY_SELL_PENALTIES: "Early Sell Penalties",
  CREATION_FEES: "Market Creation Fees",
  TRADING_FEES_TO_CREATORS: "Trading Fees To Market Creators",
  TRADING_FEES_TO_PROTOCOL: "Trading Fees To Protocol",
  PENALTIES_TO_WINNERS: "Early Sell Penalties To Winners",
  PENALTIES_TO_PROTOCOL: "Early Sell Penalties To Protocol",
  CREATION_FEES_TO_PROTOCOL: "Market Creation Fees To Protocol",
  CREATION_FEES_TO_BUYBACK: "Market Creation Fees To PFWA Buyback",
  BUYBACK: "PFWA Buyback And Burn",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const live = getPfwaLiveFactories(options);
  const factories = live.map(({ factory }) => factory);
  const v2Factory = live.find(({ version }) => version === 2)?.factory; // only v2 buys back $PFWA
  const { buys, sells } = await getPfwaMarketTrades(options);
  const [marketCreations, wethSpent, pfwaBurned]: [MarketCreatedLog[][], TransferLog[], TransferLog[]] = await Promise.all([
    options.getLogs({ targets: factories, eventAbi: MARKET_CREATED, onlyArgs: false, flatten: false }),
    // the v2 factory's buyback swaps: WETH it pays into the pool, and the $PFWA it then sends to the dead address,
    // both inside the createMarket call that charged the fee
    v2Factory ? options.getLogs({ target: WETH, eventAbi: TRANSFER, topics: [TRANSFER_TOPIC, toTopic(v2Factory)], onlyArgs: false }) : [],
    v2Factory ? options.getLogs({ target: PFWA, eventAbi: TRANSFER, topics: [TRANSFER_TOPIC, toTopic(v2Factory), toTopic(DEAD)], onlyArgs: false }) : [],
  ]);

  // settings fixed when the factory deploys a token: creator, platform, sellFeePercentage, expirationTime
  const createdFirstTokens = marketCreations.flat().map((log) => String(log.args.optionTokens[0]).toLowerCase());
  const tokenList = [...new Set([...buys.map((b) => b.token), ...sells.map((s) => s.token), ...createdFirstTokens])];
  const sellTokens = [...new Set(sells.map((s) => s.token))];
  const [creators, platforms, sellFeeRates, expirations]: Uint[][] = await Promise.all([
    options.api.multiCall({ abi: "address:creator", calls: tokenList }),
    options.api.multiCall({ abi: "address:platform", calls: tokenList }),
    options.api.multiCall({ abi: "uint256:sellFeePercentage", calls: sellTokens }),
    options.api.multiCall({ abi: "uint256:expirationTime", calls: sellTokens }),
  ]);
  const creatorOf: Record<string, string> = {};
  const creatorIsTreasury: Record<string, boolean> = {};
  tokenList.forEach((token, i) => {
    creatorOf[token] = String(creators[i]).toLowerCase();
    creatorIsTreasury[token] = creatorOf[token] === String(platforms[i]).toLowerCase();
  });
  const sellSettings: Record<string, { sellFee: bigint; expiration: number }> = {};
  sellTokens.forEach((token, i) => (sellSettings[token] = { sellFee: BigInt(sellFeeRates[i]), expiration: Number(expirations[i]) }));

  const addTradingFee = (token: string, creatorFee: bigint, platformFee: bigint) => {
    dailyFees.addGasToken(creatorFee + platformFee, L.TRADING_FEES);
    if (creatorIsTreasury[token]) {
      dailyRevenue.addGasToken(creatorFee + platformFee, L.TRADING_FEES_TO_PROTOCOL);
      dailyProtocolRevenue.addGasToken(creatorFee + platformFee, L.TRADING_FEES_TO_PROTOCOL);
    } else {
      dailySupplySideRevenue.addGasToken(creatorFee, L.TRADING_FEES_TO_CREATORS);
      dailyRevenue.addGasToken(platformFee, L.TRADING_FEES_TO_PROTOCOL);
      dailyProtocolRevenue.addGasToken(platformFee, L.TRADING_FEES_TO_PROTOCOL);
    }
  };

  for (const buy of buys) addTradingFee(buy.token, buy.creatorFee, buy.platformFee);

  // v2 sells after a market's deadline pay the trading fee instead of the penalty: find the block at each deadline
  // that falls inside the window
  const deadlineBlock: Record<number, number> = {};
  for (const token of sellTokens) {
    const exp = sellSettings[token].expiration;
    if (exp > options.startTimestamp && exp < options.endTimestamp && deadlineBlock[exp] === undefined)
      deadlineBlock[exp] = await options.getBlock(exp, options.chain, {});
  }
  const isAfterDeadline = (sell: PfwaSell) => {
    if (sell.info.version !== 2) return false;
    const { expiration } = sellSettings[sell.token];
    if (expiration <= options.startTimestamp) return true;
    return expiration < options.endTimestamp && sell.blockNumber >= deadlineBlock[expiration];
  };
  const lateTokens = [...new Set(sells.filter(isAfterDeadline).map((s) => s.token))];
  const lateFees: Uint[] = await options.api.multiCall({ abi: "uint256:feePercentage", calls: lateTokens });
  const lateFeeOf: Record<string, bigint> = {};
  lateTokens.forEach((token, i) => (lateFeeOf[token] = BigInt(lateFees[i])));
  for (const sell of sells) {
    if (isAfterDeadline(sell)) {
      const share = (sell.ethReceived * lateFeeOf[sell.token]) / 1000n;
      addTradingFee(sell.token, share, share);
    } else {
      const penalty = (sell.ethReceived * sellSettings[sell.token].sellFee) / 1000n;
      const toProtocol = penalty / 2n;
      dailyFees.addGasToken(penalty, L.EARLY_SELL_PENALTIES);
      dailyRevenue.addGasToken(toProtocol, L.PENALTIES_TO_PROTOCOL);
      dailyProtocolRevenue.addGasToken(toProtocol, L.PENALTIES_TO_PROTOCOL);
      dailySupplySideRevenue.addGasToken(penalty - toProtocol, L.PENALTIES_TO_WINNERS);
    }
  }

  // market creation fees: createMarket names the caller as the creator of the outcome tokens, while
  // createRelayerMarket (free, relayer only) names the treasury, so a market paid for its creation when the two match
  const paid: { factory: string; version: 1 | 2; tx: string }[] = [];
  marketCreations.forEach((logs, i) => {
    for (const log of logs) {
      const creator = String(log.args.creator).toLowerCase();
      if (creatorOf[String(log.args.optionTokens[0]).toLowerCase()] !== creator) continue; // relayer market, no fee
      if (PFWA_PROTOCOL_WALLETS.has(creator)) continue;
      paid.push({ factory: factories[i], version: live[i].version, tx: String(log.transactionHash).toLowerCase() });
    }
  });
  const paidFactories = [...new Set(paid.map(({ factory }) => factory))];
  const creationFees: Uint[] = await options.api.multiCall({ abi: "uint256:marketCreationFee", calls: paidFactories });
  const creationFeeOf: Record<string, bigint> = {};
  paidFactories.forEach((factory, i) => (creationFeeOf[factory] = BigInt(creationFees[i])));
  const buybackBps = paid.some(({ version }) => version === 2) ? BigInt(await options.api.call({ target: v2Factory!, abi: "uint256:buybackBurnPercentage" })) : 0n;
  const paidCreationTxs = new Set<string>();
  for (const { factory, version, tx } of paid) {
    const creationFee = creationFeeOf[factory];
    const toBuyback = version === 2 ? (creationFee * buybackBps) / 10000n : 0n;
    if (version === 2) paidCreationTxs.add(tx);
    dailyFees.addGasToken(creationFee, L.CREATION_FEES);
    dailyRevenue.addGasToken(creationFee - toBuyback, L.CREATION_FEES_TO_PROTOCOL);
    dailyProtocolRevenue.addGasToken(creationFee - toBuyback, L.CREATION_FEES_TO_PROTOCOL);
    if (toBuyback > 0n) dailyRevenue.addGasToken(toBuyback, L.CREATION_FEES_TO_BUYBACK);
  }

  // $PFWA bought and burned: the WETH the v2 factory paid for $PFWA that it sent to the dead address, in the paid
  // market creations above (the swap and the burn run inside createMarket, so they share its transaction)
  const burnTxs = new Set(pfwaBurned.map((log) => String(log.transactionHash).toLowerCase()));
  for (const log of wethSpent) {
    const tx = String(log.transactionHash).toLowerCase();
    if (burnTxs.has(tx) && paidCreationTxs.has(tx)) dailyHoldersRevenue.add(WETH, log.args.value, L.BUYBACK);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Everything traders and market creators pay on PFWA Markets: the trading fee on buys and on sells after a market's deadline, the early-sell penalty on sells before the deadline, and the fee to create a market. Activity of PFWA's own wallets (team, market seeder, market-making agent) is excluded.",
  UserFees: "Everything traders and market creators pay on PFWA Markets: trading fees, early-sell penalties and market creation fees.",
  Revenue: "The protocol's share of all fees: the protocol's leg of every trading fee (both legs on markets the protocol created), half of every early-sell penalty, and the market creation fee, including the part spent buying back and burning $PFWA.",
  ProtocolRevenue: "The fees sent to the PFWA treasury: the protocol's leg of every trading fee (both legs on markets the protocol created), half of every early-sell penalty, and the part of each market creation fee not used for the $PFWA buyback.",
  HoldersRevenue: "ETH spent buying $PFWA that is burned: half of each v2 market creation fee is swapped for $PFWA in the same transaction and sent to the dead address.",
  SupplySideRevenue: "The market creator's leg of the trading fee on markets created by users, and the half of each early-sell penalty paid into the market's bonus pot for the winning side.",
};

const breakdownMethodology = {
  Fees: {
    [L.TRADING_FEES]: "The fee on buys and on sells after a market's deadline: feePercentage per mille of the trade, charged once for the market creator and once for the protocol (1% + 1% on current markets, 1.5% + 1.5% on older ones).",
    [L.EARLY_SELL_PENALTIES]: "The penalty on sells before a market's deadline: sellFeePercentage per mille of the proceeds (10% on current markets).",
    [L.CREATION_FEES]: "The flat fee paid to create a market (0.001 ETH on the v2 factory, 0.0005 ETH on v1). Markets the protocol's relayer creates pay none.",
  },
  UserFees: {
    [L.TRADING_FEES]: "The fee on buys and on sells after a market's deadline, paid by the trader.",
    [L.EARLY_SELL_PENALTIES]: "The penalty on sells before a market's deadline, paid by the seller.",
    [L.CREATION_FEES]: "The flat fee paid by the market's creator.",
  },
  Revenue: {
    [L.TRADING_FEES_TO_PROTOCOL]: "The protocol's leg of the trading fee, plus the creator's leg on markets whose creator is the PFWA treasury.",
    [L.PENALTIES_TO_PROTOCOL]: "Half of each early-sell penalty, sent to the PFWA treasury.",
    [L.CREATION_FEES_TO_PROTOCOL]: "The part of the market creation fee sent to the PFWA treasury (all of it on v1, half on v2).",
    [L.CREATION_FEES_TO_BUYBACK]: "The part of each v2 market creation fee spent buying back and burning $PFWA (half, buybackBurnPercentage 5000 bps).",
  },
  ProtocolRevenue: {
    [L.TRADING_FEES_TO_PROTOCOL]: "The protocol's leg of the trading fee, plus the creator's leg on markets whose creator is the PFWA treasury.",
    [L.PENALTIES_TO_PROTOCOL]: "Half of each early-sell penalty, sent to the PFWA treasury.",
    [L.CREATION_FEES_TO_PROTOCOL]: "The part of the market creation fee sent to the PFWA treasury.",
  },
  HoldersRevenue: {
    [L.BUYBACK]: "WETH the v2 factory spends on $PFWA (1% WETH/PFWA Uniswap v3 pool) that it then transfers to the dead address, inside each paid market creation.",
  },
  SupplySideRevenue: {
    [L.TRADING_FEES_TO_CREATORS]: "The market creator's leg of the trading fee, on markets created by users.",
    [L.PENALTIES_TO_WINNERS]: "Half of each early-sell penalty, added to the market's bonus pot and paid to the winning side when the market resolves.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-31",
  methodology,
  breakdownMethodology,
};

export default adapter;
