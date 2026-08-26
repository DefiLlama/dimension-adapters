import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Current production Manager and deployment block on X Layer.
// Explorer: https://www.okx.com/web3/explorer/xlayer/address/0x96b51c57e5346d0c0198899243cf851d1e23c309
const MANAGER = "0x96b51c57e5346d0c0198899243cf851d1e23c309";
const FROM_BLOCK = 68_373_506;
const ZERO = "0x0000000000000000000000000000000000000000";

const TOKEN_CREATED =
  "event TokenCreated(address indexed token,address indexed creator,address indexed quote,uint256 graduation,string metadataURI,address vault,address tracker,uint16 templateId)";
const TRADE =
  "event Trade(address indexed token,address indexed trader,bool isBuy,uint256 grossQuoteAmount,uint256 netQuoteAmount,uint256 curveQuoteAmount,uint256 tokenAmount,uint256 platformFee,uint256 taxFee,uint128 collected)";

const fetch = async (options: FetchOptions) => {
  const launches = await options.getLogs({
    target: MANAGER,
    eventAbi: TOKEN_CREATED,
    fromBlock: FROM_BLOCK,
    cacheInCloud: true,
  });
  const quoteByToken = new Map(
    launches.map((log: any) => [log.token.toLowerCase(), log.quote.toLowerCase()]),
  );
  const trades = await options.getLogs({ target: MANAGER, eventAbi: TRADE });
  const dailyVolume = options.createBalances();

  for (const trade of trades) {
    const quote = quoteByToken.get(trade.token.toLowerCase());
    if (!quote) throw new Error(`Missing quote for Ignix token ${trade.token}`);

    const gross = BigInt(trade.grossQuoteAmount);
    const net = BigInt(trade.netQuoteAmount);
    const curve = BigInt(trade.curveQuoteAmount);
    if (
      gross < net ||
      gross - net !== BigInt(trade.platformFee) + BigInt(trade.taxFee) ||
      curve !== (trade.isBuy ? net : gross)
    ) {
      throw new Error(`Invalid Ignix Trade accounting for token ${trade.token}`);
    }

    if (quote === ZERO) dailyVolume.addGasToken(curve);
    else dailyVolume.add(quote, curve);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.XLAYER],
  start: "2026-08-19",
  fetch,
  methodology: {
    Volume:
      "Quote-side volume settled by Ignix bonding curves. Post-graduation Uniswap swaps are excluded.",
  },
};

export default adapter;
