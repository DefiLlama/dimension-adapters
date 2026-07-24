import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

// Morpho Midnight is a fixed-rate, zero-coupon, orderbook lending protocol (distinct from the
// floating-rate Morpho Blue adapter in fees/morpho). Lenders buy `credit`, borrowers sell `debt
// units`; 1 unit settles for 1 loan token at maturity. Every trade is executed via `take` and is
// fully described by three fields of the Take event:
//   units        - face value traded (repaid at maturity)
//   buyerAssets  - loan tokens the lender (buyer) pays now
//   sellerAssets - loan tokens the borrower (seller) receives now
// From these the whole fee decomposition is exact (see Midnight.sol: on every take
// `claimableSettlementFee[loanToken] += buyerAssets - sellerAssets`):
//   borrower interest   = units - sellerAssets   (face value minus what the borrower received)
//   settlement fee      = buyerAssets - sellerAssets  (taker-paid spread kept by the protocol)
//   continuous fee      = buyerPendingFeeIncrease     (per-second fee on the new lender credit)
//   lender net yield    = interest - settlement fee - continuous fee
//
// Recognition: the interest of a zero-coupon trade is locked in at execution, so it is recognized
// upfront on the trade day (the same daily-getLogs shape the Morpho Blue adapter uses for
// AccrueInterest). Both protocol fees are 0 on every market at launch, but are computed generically
// so Revenue auto-populates if Morpho enables them later.

interface MidnightConfig {
  chainId: number;
  midnight: string;
  fromBlock: number;
  start: string;
}

const MidnightConfigs: Record<string, MidnightConfig> = {
  [CHAIN.BASE]: {
    chainId: 8453,
    midnight: "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
    fromBlock: 48286884,
    start: "2026-07-06",
  },
};

const eventAbis = {
  marketCreated:
    "event MarketCreated((uint256 chainId,address midnight,address loanToken,(address token,uint256 lltv,uint256 liquidationCursor,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate) market,bytes32 indexed id_)",
  take: "event Take(address caller,bytes32 offerHash,bytes32 indexed id_,bool offerIsBuy,address indexed maker,bytes32 group,address ratifier,bytes ratifierData,uint256 units,address indexed taker,uint256 buyerAssets,uint256 sellerAssets,uint256 consumed,uint256 buyerPendingFeeIncrease,uint256 sellerPendingFeeDecrease,int256 totalUnitsDelta,address receiver,address payer)",
};

const MORPHO_API = "https://api.morpho.org/v0/midnight";

const methodology = {
  Fees: "Total borrow interest paid by borrowers: for every trade, the face value of the debt (units) minus the loan tokens the borrower received (sellerAssets), i.e. the fixed-rate discount locked in at execution.",
  Revenue: "Protocol fees kept by Morpho: the settlement fee (taker-paid spread on each trade) plus the continuous fee accrued on new lender credit. Both are disabled at launch, so Revenue is currently 0.",
  ProtocolRevenue: "Same as Revenue: settlement fee plus continuous fee. Currently 0 while both fees are disabled.",
  SupplySideRevenue: "Interest distributed to lenders: total borrow interest minus the protocol settlement and continuous fees.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Face value (units) minus proceeds to the borrower (sellerAssets) on every trade in listed markets.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Settlement fee (buyerAssets - sellerAssets) plus continuous fee (buyerPendingFeeIncrease) per trade. Currently 0.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Settlement fee plus continuous fee per trade. Currently 0.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Borrow interest net of protocol settlement and continuous fees, distributed to lenders.",
  },
}

// Scope mirrors the Part-1 TVL adapter (DefiLlama-Adapters projects/morpho-midnight): only markets
// flagged `listed` by the Morpho API trust layer. This is a single filter that can be dropped later
// to cover every Midnight market (DefiLlama blacklist-style).
async function getListedMarketIds(chainId: number): Promise<Set<string>> {
  const ids = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ chain_ids: String(chainId), listed: "true", limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const body = await httpGet(`${MORPHO_API}/markets?${query}`, { headers: { accept: "application/json" } });
    for (const market of body.data) ids.add(String(market.market_id).toLowerCase());
    cursor = body.cursor ?? undefined;
    if (cursor && seenCursors.has(cursor)) throw new Error("Morpho Midnight API returned a repeated cursor");
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return ids;
}

// Maps each created market id to its loan token, enumerated purely from MarketCreated logs.
async function getMarketLoanTokens(options: FetchOptions): Promise<Map<string, string>> {
  const { midnight, fromBlock } = MidnightConfigs[options.chain];
  const logs = await options.getLogs({
    target: midnight,
    eventAbi: eventAbis.marketCreated,
    fromBlock,
    cacheInCloud: true,
  });
  const loanTokens = new Map<string, string>();
  for (const log of logs) loanTokens.set(String(log.id_).toLowerCase(), log.market.loanToken);
  return loanTokens;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const cfg = MidnightConfigs[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [loanTokens, listedIds, takes] = await Promise.all([
    getMarketLoanTokens(options),
    getListedMarketIds(cfg.chainId),
    options.getLogs({ target: cfg.midnight, eventAbi: eventAbis.take }),
  ]);

  for (const take of takes) {
    const id = String(take.id_).toLowerCase();
    // Restrict to listed markets that were also created on the configured Midnight contract, so a
    // listing entry from another deployment can never widen scope.
    if (!listedIds.has(id)) continue;
    const loanToken = loanTokens.get(id);
    if (!loanToken) continue;

    const units = BigInt(take.units);
    const buyerAssets = BigInt(take.buyerAssets);
    const sellerAssets = BigInt(take.sellerAssets);

    // Borrower interest: fixed-rate discount locked in at the trade. Recognized on all takes; on
    // rare secondary trades between lenders this reprices an existing claim rather than originating
    // new debt (Take.totalUnitsDelta > 0 marks new debt), which is negligible at launch.
    const interest = units - sellerAssets;
    // Protocol revenue realized at the trade: settlement-fee spread plus the continuous fee charged
    // on the new lender credit. Both are 0 while the fees are disabled.
    const protocolRevenue = (buyerAssets - sellerAssets) + BigInt(take.buyerPendingFeeIncrease);

    dailyFees.add(loanToken, interest, METRIC.BORROW_INTEREST);
    dailyRevenue.add(loanToken, protocolRevenue, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.add(loanToken, interest - protocolRevenue, METRIC.BORROW_INTEREST);
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
  pullHourly: true,
  methodology,
  breakdownMethodology,
  fetch,
  adapter: MidnightConfigs,
};

export default adapter;
