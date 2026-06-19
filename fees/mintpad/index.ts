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

const fetchCronosFees = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const [takerBidEvents, takerAskEvents, makerMatchEvents] = await Promise.all([
    options.getLogs({ target: contractAddress, eventAbi: takerBidAbi }),
    options.getLogs({ target: contractAddress, eventAbi: takerAskAbi }),
    options.getLogs({ target: contractAddress, eventAbi: makerMatchAbi }),
  ]);

  const allEvents = [...takerBidEvents, ...takerAskEvents, ...makerMatchEvents];

  allEvents.forEach((event: any) => {
    // `currency` is the ERC20 used for payment (e.g. WCRO); price is denominated in that token
    dailyVolume.add(event.currency, event.price);
  });

  // Protocol fee is 2% of total volume
  const dailyFees = dailyVolume.clone(PROTOCOL_FEE_BPS / 10000);

  return {
    dailyFees,
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
    Fees: "2% protocol fee charged on all NFT marketplace sales",
    Volume: "Total volume of NFT sales on the Mintpad exchange (TakerBid + TakerAsk + MakerMatch events)"
  }
};

export default adapter;