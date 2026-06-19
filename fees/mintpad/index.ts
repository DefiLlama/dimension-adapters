import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// MintpadExchange proxy
const contractAddress = "0xdFbE43b2c154B6a790158fa2696cDb32A86Efc78";

// Protocol fee is 200 bps = 2% (set in StrategyStandardSaleForFixedPrice constructor)
const PROTOCOL_FEE_BPS = 200;

// All three sale events emit a `price` field representing the full sale price
const takerBidAbi = "event TakerBid(bytes32 orderHash, uint256 orderNonce, address indexed taker, address indexed maker, address indexed strategy, address currency, address collection, uint256 tokenId, uint256 amount, uint256 price)";
const takerAskAbi = "event TakerAsk(bytes32 orderHash, uint256 orderNonce, address indexed taker, address indexed maker, address indexed strategy, address currency, address collection, uint256 tokenId, uint256 amount, uint256 price)";
const makerMatchAbi = "event MakerMatch(bytes32 orderHash, uint256 bidOrderNonce, uint256 askOrderNonce, address indexed taker, address indexed maker, address indexed strategy, address currency, address collection, uint256 tokenId, uint256 amount, uint256 price)";
// Emitted whenever a royalty is paid to a creator
const royaltyPaymentAbi = "event RoyaltyPayment(address indexed collection, uint256 indexed tokenId, address indexed royaltyRecipient, address currency, uint256 amount)";

const fetchCronosFees = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [takerBidEvents, takerAskEvents, makerMatchEvents, royaltyEvents] = await Promise.all([
    options.getLogs({ target: contractAddress, eventAbi: takerBidAbi }),
    options.getLogs({ target: contractAddress, eventAbi: takerAskAbi }),
    options.getLogs({ target: contractAddress, eventAbi: makerMatchAbi }),
    options.getLogs({ target: contractAddress, eventAbi: royaltyPaymentAbi }),
  ]);

  const allEvents = [...takerBidEvents, ...takerAskEvents, ...makerMatchEvents];

  allEvents.forEach((event: any) => {
    // `currency` is the ERC20 used for payment (e.g. WCRO); price is denominated in that token
    dailyVolume.add(event.currency, event.price, 'NFT Sales');
  });

  royaltyEvents.forEach((event: any) => {
    dailySupplySideRevenue.add(event.currency, event.amount, 'Creator Royalties');
  });

  // Protocol fee: 2% of total volume (retained by Mintpad)
  const dailyProtocolRevenue = dailyVolume.clone(PROTOCOL_FEE_BPS / 10000);
  const dailyRevenue = dailyProtocolRevenue.clone(1);

  // Total fees = protocol fee + creator royalties (income statement identity)
  const dailyFees = dailyProtocolRevenue.clone(1);
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch: fetchCronosFees,
      start: '2026-05-30',
    },
  },
  methodology: {
    Fees: "Total fees from NFT sales: 2% protocol fee plus creator royalties",
    Revenue: "Protocol-retained portion of marketplace fees (2% of volume)",
    ProtocolRevenue: "Treasury/protocol retained portion of fees",
    SupplySideRevenue: "Creator royalties paid on each sale",
    Volume: "Total volume of NFT sales on the Mintpad exchange (TakerBid + TakerAsk + MakerMatch events)"
  },
  breakdownMethodology: {
    Fees: {
      'NFT Sales': '2% protocol fee applied to NFT sales volume from matched orders.',
      'Creator Royalties': 'Creator royalties collected on each sale.',
    },
    Revenue: {
      'NFT Sales': 'Protocol-retained marketplace trading fees (2% of volume).',
    },
    SupplySideRevenue: {
      'Creator Royalties': 'Royalties paid to NFT creators on secondary sales.',
    },
    Volume: {
      'NFT Sales': 'Executed NFT sale notional from TakerBid, TakerAsk, and MakerMatch events.',
    },
  }
};

export default adapter;