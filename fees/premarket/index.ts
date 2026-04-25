import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  fetchMarketsById,
  fetchMintFees,
  fetchOrderFees,
  fetchPrmInfosById,
  fetchRedeemFees,
  fetchRolloverFees,
  getCollateralNotional,
  getRedeemFeeToken,
  normalizeAddress,
  PREMARKET_START_DATE,
  prmTokenIdFromAnyTokenId,
} from "../../helpers/premarket";

const METRICS = {
  tradingFees: "Trading Fees",
  mintFees: "Mint Fees",
  redeemFees: "Redeem Fees",
  rolloverFees: "Rollover Fees",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [orderFees, mintFees, redeemFees, rolloverFees] = await Promise.all([
    fetchOrderFees(options),
    fetchMintFees(options),
    fetchRedeemFees(options),
    fetchRolloverFees(options),
  ]);

  const marketIds = [
    ...orderFees.map((fee) => fee.marketId),
    ...mintFees.map((fee) => fee.marketId),
    ...rolloverFees.map((fee) => fee.marketId),
  ];
  const redeemPrmIds = redeemFees.map((fee) => fee.prmTokenId);
  const orderFeePrmIds = orderFees
    .filter((fee) => fee.isTokenAsset)
    .map((fee) => prmTokenIdFromAnyTokenId(fee.tokenId))
    .filter((id): id is string => !!id);

  const prmInfosById = await fetchPrmInfosById([
    ...redeemPrmIds,
    ...orderFeePrmIds,
  ]);
  const redeemMarketIds = redeemFees
    .map((fee) => prmInfosById.get(fee.prmTokenId)?.marketId)
    .filter((id): id is string => !!id);
  const marketsById = await fetchMarketsById([...marketIds, ...redeemMarketIds]);

  for (const fee of orderFees) {
    const market = marketsById.get(fee.marketId);
    if (!market) continue;

    if (!fee.isTokenAsset) {
      dailyFees.add(
        normalizeAddress(market.collateral),
        fee.amount,
        METRICS.tradingFees,
      );
      continue;
    }

    const prmInfo = prmInfosById.get(
      prmTokenIdFromAnyTokenId(fee.tokenId) ?? "",
    );
    if (!prmInfo) continue;

    dailyFees.add(
      normalizeAddress(market.collateral),
      getCollateralNotional(market, prmInfo, BigInt(fee.amount)),
      METRICS.tradingFees,
    );
  }

  for (const fee of mintFees) {
    const market = marketsById.get(fee.marketId);
    if (!market || BigInt(fee.fees) === 0n) continue;
    dailyFees.add(
      normalizeAddress(market.collateral),
      fee.fees,
      METRICS.mintFees,
    );
  }

  for (const fee of redeemFees) {
    const prmInfo = prmInfosById.get(fee.prmTokenId);
    const market = marketsById.get(prmInfo?.marketId ?? "");
    const token = getRedeemFeeToken(market);

    if (!token || BigInt(fee.fees) === 0n) continue;
    dailyFees.add(token, fee.fees, METRICS.redeemFees);
  }

  for (const fee of rolloverFees) {
    const market = marketsById.get(fee.marketId);
    if (!market || BigInt(fee.rolloverFee) === 0n) continue;
    dailyFees.add(
      normalizeAddress(market.collateral),
      fee.rolloverFee,
      METRICS.rolloverFees,
    );
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Trading fees, mint/deposit fees, redeem/exercise fees, and rollover fees indexed by Premarket's GraphQL subgraph.",
  Revenue:
    "All indexed fees are collected by the Premarket protocol fee receiver.",
  ProtocolRevenue:
    "All indexed fees are treated as protocol revenue until a supply-side or holder revenue split is introduced.",
  SupplySideRevenue:
    "No supply-side fee split is currently indexed for Premarket, so supply-side revenue is reported as zero.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.tradingFees]:
      "Maker and taker trading fees charged by the Premarket exchange.",
    [METRICS.mintFees]:
      "Deposit fees charged when PRM and oPRM positions are minted.",
    [METRICS.redeemFees]:
      "Exercise/redeem fees charged when option PRM positions are redeemed.",
    [METRICS.rolloverFees]:
      "Fees charged when positions are rolled to a new expiry.",
  },
  Revenue: {
    [METRICS.tradingFees]: "Trading fees collected by the protocol fee receiver.",
    [METRICS.mintFees]: "Mint fees collected by the protocol fee receiver.",
    [METRICS.redeemFees]: "Redeem fees collected by the protocol fee receiver.",
    [METRICS.rolloverFees]: "Rollover fees collected by the protocol fee receiver.",
  },
  ProtocolRevenue: {
    [METRICS.tradingFees]: "Trading fees collected by the protocol fee receiver.",
    [METRICS.mintFees]: "Mint fees collected by the protocol fee receiver.",
    [METRICS.redeemFees]: "Redeem fees collected by the protocol fee receiver.",
    [METRICS.rolloverFees]: "Rollover fees collected by the protocol fee receiver.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: PREMARKET_START_DATE,
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
