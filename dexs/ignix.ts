import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';

// Current production Manager and deployment block on X Layer.
// Explorer: https://www.okx.com/web3/explorer/xlayer/address/0x96b51c57e5346d0c0198899243cf851d1e23c309
const MANAGER = "0x96b51c57e5346d0c0198899243cf851d1e23c309";
const FROM_BLOCK = 68_373_506;
const ZERO = ADDRESSES.null;

const TOKEN_CREATED =
  "event TokenCreated(address indexed token,address indexed creator,address indexed quote,uint256 graduation,string metadataURI,address vault,address tracker,uint16 templateId)";
const TRADE =
  "event Trade(address indexed token,address indexed trader,bool isBuy,uint256 grossQuoteAmount,uint256 netQuoteAmount,uint256 curveQuoteAmount,uint256 tokenAmount,uint256 platformFee,uint256 taxFee,uint128 collected)";

const PLATFORM_FEE = "Bonding Curve Platform Fees";
const LAUNCH_TAX = "Bonding Curve Launch Taxes";
const PROTOCOL_SHARE = "Bonding Curve Fees to Ignix";
const SUPPLY_SIDE_SHARE = "Bonding Curve Taxes to Launch Stakeholders";

function addQuote(balance: any, quote: string, amount: bigint, label: string) {
  if (!amount) return;
  if (quote === ZERO) balance.addGasToken(amount, label);
  else balance.add(quote, amount, label);
}

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
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const trade of trades) {
    const quote = quoteByToken.get(trade.token.toLowerCase());
    if (!quote) throw new Error(`Missing quote for Ignix token ${trade.token}`);

    const gross = BigInt(trade.grossQuoteAmount);
    const net = BigInt(trade.netQuoteAmount);
    const curve = BigInt(trade.curveQuoteAmount);
    const platformFee = BigInt(trade.platformFee);
    const taxFee = BigInt(trade.taxFee);
    if (
      gross < net ||
      gross - net !== platformFee + taxFee ||
      curve !== (trade.isBuy ? net : gross)
    ) {
      throw new Error(`Invalid Ignix Trade accounting for token ${trade.token}`);
    }

    if (quote === ZERO) dailyVolume.addGasToken(curve);
    else dailyVolume.add(quote, curve);

    addQuote(dailyFees, quote, platformFee, PLATFORM_FEE);
    addQuote(dailyFees, quote, taxFee, LAUNCH_TAX);
    addQuote(dailyUserFees, quote, platformFee, PLATFORM_FEE);
    addQuote(dailyUserFees, quote, taxFee, LAUNCH_TAX);
    addQuote(dailyRevenue, quote, platformFee, PROTOCOL_SHARE);
    addQuote(dailyProtocolRevenue, quote, platformFee, PROTOCOL_SHARE);
    addQuote(dailySupplySideRevenue, quote, taxFee, SUPPLY_SIDE_SHARE);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
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
    Fees: "Platform fees and launch taxes paid by users trading on Ignix bonding curves.",
    UserFees: "All tracked bonding-curve fees are paid directly by traders.",
    Revenue: "The platform-fee portion retained by Ignix.",
    ProtocolRevenue: "All Ignix revenue (platform fees portion) accrues to the protocol.",
    SupplySideRevenue:
      "Launch taxes and anti-snipe fees allocated to launch creators and token-holder vaults.",
  },
  breakdownMethodology: {
    Fees: {
      [PLATFORM_FEE]: "The platformFee field of each Ignix Trade event.",
      [LAUNCH_TAX]: "The taxFee field of each Ignix Trade event.",
    },
    UserFees: {
      [PLATFORM_FEE]: "Platform fees paid by bonding-curve traders.",
      [LAUNCH_TAX]: "Launch taxes and anti-snipe fees paid by bonding-curve traders.",
    },
    Revenue: {
      [PROTOCOL_SHARE]: "Bonding-curve platform fees retained by Ignix.",
    },
    ProtocolRevenue: {
      [PROTOCOL_SHARE]: "Bonding-curve platform fees accrued to Ignix.",
    },
    SupplySideRevenue: {
      [SUPPLY_SIDE_SHARE]:
        "Launch taxes and anti-snipe fees allocated to launch creators and token-holder vaults.",
    },
  },
};

export default adapter;
