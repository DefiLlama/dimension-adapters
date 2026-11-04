import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Clutch TV (stonkbrokers.io/tv): streamer channels on Robinhood Chain.
// Each channel is a ClutchPass ERC-721 on a rising bonding curve created by
// ClutchTVFactory; viewers buy and sell passes in ETH. Tips go through
// ClutchTipJar in ETH or any listed ERC-20. Both rails pay a 2.5% protocol fee
// to ClutchFeeRouter, which sends 60% to a STONKBROKER buyback and burn and 40%
// to the treasury. Pass trades also pay the streamer a royalty (up to 10%).
const FACTORY = "0x81b03346B4186a7d5c94bb1B11A83f6e0f96F2DC";
const TIP_JAR = "0xec371C1664Dab7dD7b00aAf7Cc16c4181Ef2cE43";
const FACTORY_START_BLOCK = 100324098;
const BURN_BPS = 6000n;
const BPS = 10000n;
const NATIVE = "0x0000000000000000000000000000000000000000";

const EV = {
  channelCreated: "event ChannelCreated(address indexed creator, string handle, address pass, address agent)",
  passBought: "event PassBought(address indexed buyer, uint256 indexed id, uint256 price, uint256 protocolFee, uint256 royalty)",
  passSold: "event PassSold(address indexed seller, uint256 indexed id, uint256 price, uint256 protocolFee, uint256 royalty)",
  tip: "event Tip(address indexed creator, address indexed from, address indexed token, uint256 amount, uint256 fee, string memo)",
};

const LABELS = {
  PassProtocolFee: "Pass Trade Protocol Fee",
  PassRoyalty: "Pass Trade Streamer Royalty",
  TipFee: "Tip Protocol Fee",
  Buyback: "STONKBROKER Buyback And Burn",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const channels = await options.getLogs({
    target: FACTORY,
    eventAbi: EV.channelCreated,
    fromBlock: FACTORY_START_BLOCK,
    cacheInCloud: true,
  });
  const passes = [...new Set(channels.map((c: any) => String(c.pass).toLowerCase()))];

  const [buys, sells, tips] = await Promise.all([
    passes.length ? options.getLogs({ targets: passes, eventAbi: EV.passBought }) : [],
    passes.length ? options.getLogs({ targets: passes, eventAbi: EV.passSold }) : [],
    options.getLogs({ target: TIP_JAR, eventAbi: EV.tip }),
  ]);

  const addProtocolFee = (token: string, fee: bigint, label: string) => {
    if (fee === 0n) return;
    const burn = (fee * BURN_BPS) / BPS;
    const treasury = fee - burn;
    dailyFees.add(token, fee, label);
    dailyRevenue.add(token, fee, label);
    dailyHoldersRevenue.add(token, burn, LABELS.Buyback);
    dailyProtocolRevenue.add(token, treasury, label);
  };

  for (const trade of [...buys, ...sells]) {
    const price = BigInt(trade.price);
    const protocolFee = BigInt(trade.protocolFee);
    const royalty = BigInt(trade.royalty);
    dailyVolume.addGasToken(price);
    addProtocolFee(NATIVE, protocolFee, LABELS.PassProtocolFee);
    if (royalty > 0n) {
      dailyFees.addGasToken(royalty, LABELS.PassRoyalty);
      dailySupplySideRevenue.addGasToken(royalty, LABELS.PassRoyalty);
    }
  }

  for (const t of tips) {
    const token = String(t.token).toLowerCase();
    const amount = BigInt(t.amount); // net to the streamer
    const fee = BigInt(t.fee);
    dailyVolume.add(token, amount + fee);
    addProtocolFee(token, fee, LABELS.TipFee);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Bonding curve price of every Clutch TV pass bought or sold, plus the gross amount of every tip (net to the streamer plus the protocol fee).",
  Fees: "2.5% protocol fee on pass trades and tips, plus the streamer royalty paid on every pass trade.",
  Revenue: "The 2.5% protocol fee on pass trades and tips, collected by the ClutchFeeRouter.",
  ProtocolRevenue: "40% of the protocol fee, sent to the StonkBrokers treasury.",
  HoldersRevenue: "60% of the protocol fee, used to buy back and burn STONKBROKER.",
  SupplySideRevenue: "Royalties paid to streamers on pass trades. Tips themselves go to streamers and are counted as volume, not fees.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.PassProtocolFee]: "2.5% protocol fee charged on every pass buy and sell.",
    [LABELS.PassRoyalty]: "Streamer royalty charged on every pass buy and sell (set per channel, max 10%).",
    [LABELS.TipFee]: "2.5% protocol fee taken from every tip.",
  },
  Revenue: {
    [LABELS.PassProtocolFee]: "2.5% protocol fee on pass trades.",
    [LABELS.TipFee]: "2.5% protocol fee on tips.",
  },
  ProtocolRevenue: {
    [LABELS.PassProtocolFee]: "40% of the pass trade protocol fee to the treasury.",
    [LABELS.TipFee]: "40% of the tip protocol fee to the treasury.",
  },
  HoldersRevenue: {
    [LABELS.Buyback]: "60% of all protocol fees, used to buy back and burn STONKBROKER.",
  },
  SupplySideRevenue: {
    [LABELS.PassRoyalty]: "Royalties paid to streamers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-10-28",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
