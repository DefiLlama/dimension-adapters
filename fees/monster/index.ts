import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// MNSTR Gacha — MegaETH PROD
const GACHA_STARTER = "0xdEa1D72f08D83e36946128603d4cD0A180A938A9";
const GACHA_PREMIUM = "0x6A786932b1cA83E2343B85483101C5B820860AC4";
const GACHA_ULTRA = "0xebB285B5cd4610D0f6dc538379A7027F02274ca2";
const GACHA_CONTRACTS = [GACHA_STARTER, GACHA_PREMIUM, GACHA_ULTRA];

const USDM = "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7";
const PAYMENT_WALLET = "0x61fccfC0279B09c387608efF56Fd9187e61D2874";
const TREASURY = "0x7Fc8d4b747dAc14b68bEe79d93C7130257c98a62";

const GachaPlayedEvent =
  "event GachaPlayed(address indexed player, uint256 indexed requestId, uint256 costPaid)";
const TransferEvent =
  "event Transfer(address indexed from, address indexed to, uint256 value)";

const PLAY_LABEL = "Gacha Play";
const SELLBACK_LABEL = "Card Sellback";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const playLogs = await options.getLogs({
    targets: GACHA_CONTRACTS,
    eventAbi: GachaPlayedEvent,
    flatten: true,
  });
  for (const log of playLogs) {
    const cost = log.costPaid;
    dailyFees.add(USDM, cost, PLAY_LABEL);
    dailyRevenue.add(USDM, cost, PLAY_LABEL);
  }

  const transferLogs = await options.getLogs({
    target: USDM,
    eventAbi: TransferEvent,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x000000000000000000000000" + PAYMENT_WALLET.slice(2).toLowerCase(),
    ],
  });
  for (const log of transferLogs) {
    const to = String(log.to).toLowerCase();
    if (to === TREASURY.toLowerCase()) continue;
    const value = log.value;
    dailySupplySideRevenue.add(USDM, value, SELLBACK_LABEL);
    dailyRevenue.subtractToken(USDM, value, PLAY_LABEL);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  allowNegativeValue: true,
  pullHourly: true,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: "2026-04-25",
    },
  },
  methodology: {
    Fees:
      "USDm paid by users into the three Gacha contracts when calling play(). Sourced from the costPaid field on GachaPlayed events.",
    Revenue:
      "Net USDm retained by the protocol: gross play fees minus sellback payouts.",
    SupplySideRevenue:
      "USDm paid back to users for card sellbacks. The contract emits NFTSoldBack but the keeper sends USDm offchain, so we attribute outflows from the payment wallet (excluding transfers to the treasury) as sellback payouts.",
    ProtocolRevenue:
      "Net USDm retained by the protocol: gross play fees minus sellback payouts.",
  },
  breakdownMethodology: {
    Fees: {
      [PLAY_LABEL]: "USDm paid by users into the Starter, Premium, and Ultra Gacha contracts (costPaid from GachaPlayed events).",
    },
    Revenue: {
      [PLAY_LABEL]: "Net USDm retained by the protocol: gross play fees minus sellback payouts.",
    },
    ProtocolRevenue: {
      [PLAY_LABEL]: "Net USDm retained by the protocol: gross play fees minus sellback payouts.",
    },
    SupplySideRevenue: {
      [SELLBACK_LABEL]: "USDm sent from the payment wallet to card sellers (excluding treasury transfers); represents sellback payouts.",
    }
  },
};

export default adapter;
