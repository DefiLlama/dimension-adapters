import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ChainApi } from "@defillama/sdk";
import { PHYSICAL_CARD_COSTS } from "../../helpers/physicalCards";

// MNSTR Gacha — MegaETH PROD
const GACHA_STARTER = "0xdEa1D72f08D83e36946128603d4cD0A180A938A9";
const GACHA_GREAT = "0x79dD7dA84a93AbBd304d41cf0addB20f8435F532";
const GACHA_ADVENTURE = "0x1472A250E3663a33A62142A8c68b6C3C611E47BF";
const GACHA_PREMIUM = "0x6A786932b1cA83E2343B85483101C5B820860AC4";
const GACHA_OUTLAW = "0xd7119f7251AFD521847Ae6BcA51a56c3F24971e3";
const GACHA_ULTRA = "0xebB285B5cd4610D0f6dc538379A7027F02274ca2";
// Same six tiers redeployed on 2026-11-01 (identical verified OffchainGacha source, paymentWallet PAYMENT_WALLET_V2);
// the old set was handed to the CardMarketplace and stopped emitting GachaPlayed that day.
// https://megaeth.blockscout.com/address/0x2a157df1cf11cc05407a6444d0ab3b89afbbde9d?tab=contract (others likewise)
const GACHA_STARTER_V2 = "0x2a157df1cf11cc05407a6444d0ab3b89afbbde9d";
const GACHA_GREAT_V2 = "0x140d342e22b86ea3e3450554f93875150ef04386";
const GACHA_ADVENTURE_V2 = "0x7914314423953b9b86f6cd7e956620e412128e90";
const GACHA_PREMIUM_V2 = "0x54b2f4d7bb8391f38182551765f667aa7adf8b09";
const GACHA_OUTLAW_V2 = "0xdfc298c476fa7ce3e18ff17f80d2f8b90d78c83f";
const GACHA_ULTRA_V2 = "0x88eaa039868bb9458ee150657162aef7d773c14b";
const GACHA_CONTRACTS = [
  GACHA_STARTER, GACHA_GREAT, GACHA_ADVENTURE, GACHA_PREMIUM, GACHA_OUTLAW, GACHA_ULTRA,
  GACHA_STARTER_V2, GACHA_GREAT_V2, GACHA_ADVENTURE_V2, GACHA_PREMIUM_V2, GACHA_OUTLAW_V2, GACHA_ULTRA_V2,
];

const USDM = ADDRESSES.megaeth.USDm;
const USDC = ADDRESSES.base.USDC;
const PAYMENT_WALLET = "0x61fccfC0279B09c387608efF56Fd9187e61D2874";
// receives plays and pays sellbacks for the 2026-11-01 contracts; no USDm flows before that day
// https://megaeth.blockscout.com/address/0x78e1862D09c44002d6A6e687Eaa3Ea653356FcE3
const PAYMENT_WALLET_V2 = "0x78e1862D09c44002d6A6e687Eaa3Ea653356FcE3";
const PAYMENT_WALLETS = [PAYMENT_WALLET, PAYMENT_WALLET_V2];
const TREASURY = "0x7Fc8d4b747dAc14b68bEe79d93C7130257c98a62";
// took ownership of the old gacha set on 2026-11-01
// https://megaeth.blockscout.com/address/0x5DB1075782527E5dDAcfdD816eA0c59B8C6EaaD3?tab=contract
const CARD_MARKETPLACE = "0x5DB1075782527E5dDAcfdD816eA0c59B8C6EaaD3";
const INTERNAL_USDM_RECIPIENTS = new Set([TREASURY, CARD_MARKETPLACE, ...PAYMENT_WALLETS].map((a) => a.toLowerCase()));
// settles credit-card payments to the payment wallet on Base — sole sender since the leg began
const CARD_PROCESSOR = "0x853f2c11774bb08031e7dea93803569bbe2058f8";

const GachaPlayedEvent =
  "event GachaPlayed(address indexed player, uint256 indexed requestId, uint256 costPaid)";
const TransferEvent =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// indexed address args are left-padded to 32 bytes
const addressTopic = (address: string) =>
  "0x000000000000000000000000" + address.slice(2).toLowerCase();
const USDC_DECIMALS = 6; // Base USDC (0x8335…2913)


const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const playLogs = await options.getLogs({
    targets: GACHA_CONTRACTS,
    eventAbi: GachaPlayedEvent,
  });

  for (const log of playLogs) {
    const cost = log.costPaid;
    dailyVolume.add(USDM, cost);
    dailyFees.add(USDM, cost, 'Gacha Play Spends - On-Chain');
  }

  for (const paymentWallet of PAYMENT_WALLETS) {
    const transferLogs = await options.getLogs({
      target: USDM,
      eventAbi: TransferEvent,
      topics: [TRANSFER_TOPIC, addressTopic(paymentWallet)],
    });
    for (const log of transferLogs) {
      const to = String(log.to).toLowerCase();
      // sweeps to the treasury, the marketplace or the other payment wallet are internal, not a payout
      if (INTERNAL_USDM_RECIPIENTS.has(to)) continue;
      dailyFees.subtractToken(USDM, log.value, 'Card Sellback Payouts To Players');
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const fetchOffchain = async (options: FetchOptions) => {
  const baseApi = new ChainApi({ chain: CHAIN.BASE });
  const dailyFees = options.createBalances();

  const transferLogs = await baseApi.getLogs({
    fromTimestamp: options.fromTimestamp,
    toTimestamp: options.toTimestamp,
    target: USDC,
    eventAbi: TransferEvent,
    onlyArgs: true,
    topics: [
      TRANSFER_TOPIC,
      addressTopic(CARD_PROCESSOR),
      addressTopic(PAYMENT_WALLET),
    ],
  });

  // no volume here: card money is credited to the player as USDm and is already
  // counted on megaeth when they open a pack with it
  for (const log of transferLogs) {
    dailyFees.addUSDValue(Number(log.value) / 10 ** USDC_DECIMALS, 'Gacha Play Spends - Credit Card');
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "USDm players spend opening Gacha packs across the six tiers (50, 100, 150, 250, 500 and 1250 USDm a pack). Promotional free packs cost the player nothing and add nothing. Credit-card purchases are not counted again here: that money is credited to the player as USDm and already shows up when they open a pack with it.",
  Fees: "What the protocol keeps from the game: pack spend plus credit-card payments, minus the USDm paid back to players who sell their cards back at up to 95% of fair market value. Goes negative on days when players sell back more than they spend.",
  Revenue: "Same as Fees — pack spend and card payments less sellback payouts to players. Nothing is shared with liquidity providers or any other supplier.",
  ProtocolRevenue: "All of it. Every dollar the protocol keeps ends up in its treasury.",
};

const feeBreakdown = {
  'Gacha Play Spends - On-Chain': 'USDm players pay to open packs on MegaETH.',
  'Gacha Play Spends - Credit Card': 'Credit-card purchases, settled to the protocol in USDC on Base before the player is credited USDm to open a pack with.',
  'Card Sellback Payouts To Players': 'USDm paid back to players who sold their cards back to the protocol, subtracted from what the protocol keeps.',
};

const breakdownMethodology = {
  Fees: feeBreakdown,
  Revenue: feeBreakdown,
  ProtocolRevenue: feeBreakdown,
}

const adapter: SimpleAdapter = {
  version: 2,
  allowNegativeValue: true,
  pullHourly: true,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: "2026-04-15",
    },
    [CHAIN.OFF_CHAIN]: {
      fetch: fetchOffchain,
      start: "2026-06-01",
    },
  },
  methodology,
  breakdownMethodology,
  unknownBreakdownMethodology: PHYSICAL_CARD_COSTS,
};

export default adapter;
