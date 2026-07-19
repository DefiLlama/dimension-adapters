import { FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { config, OFFERS_ABI } from "../dexs/whales-market";

// Whales Market fees (EVM) — measured, not estimated: the pre-market contract
// emits the charged fee amount in its settle/cancel events, denominated in the
// offer's settlement token (exToken). Fees are attributed to the day they are
// actually paid (settlements happen at TGE, long after offers are created).
// Solana is not covered yet: the program emits no equivalent decoded fee data.

const SETTLE_FILLED_ABI = "event SettleFilled(uint256 orderId, uint256 value, uint256 fee, address doer)";
const SETTLE_CANCELLED_ABI = "event SettleCancelled(uint256 orderId, uint256 value, uint256 fee, address doer)";
const CANCEL_OFFER_ABI = "event CancelOffer(uint256 offerId, uint256 refundValue, uint256 refundFee, address doer)";
const ORDERS_ABI = "function orders(uint256) view returns (uint256 offerId, uint256 amount, address seller, address buyer, uint8 status)";

const addFee = (dailyFees: any, exToken: string | undefined, amount: any) => {
  if (!exToken || !Number(amount)) return;
  if (exToken.toLowerCase() === ADDRESSES.null) dailyFees.addGasToken(amount);
  else dailyFees.add(exToken, amount);
};

// a whole multicall RPC batch can fail transiently under load; retry a few
// times before failing the run
const multiCallWithRetry = async (options: FetchOptions, params: any) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await options.api.multiCall(params);
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
};

const fetch = async (options: FetchOptions) => {
  const target = config[options.chain].contract;
  const dailyFees = options.createBalances();

  const settleLogs = [
    ...(await options.getLogs({ target, eventAbi: SETTLE_FILLED_ABI })),
    ...(await options.getLogs({ target, eventAbi: SETTLE_CANCELLED_ABI })),
  ];
  const cancelLogs = await options.getLogs({ target, eventAbi: CANCEL_OFFER_ABI });

  // fee amounts are denominated in the offer's exToken:
  // settle events carry orderId -> orders(id).offerId -> offers(id).exToken;
  // cancel events carry offerId directly
  let offerIdByOrderId = new Map<string, string>();
  if (settleLogs.length) {
    const orderIds = [...new Set(settleLogs.map((log: any) => log.orderId.toString()))];
    const orders = await multiCallWithRetry(options, { target, abi: ORDERS_ABI, calls: orderIds, permitFailure: true });
    offerIdByOrderId = new Map(orderIds.map((id, i) => [id, orders[i]?.offerId?.toString()]));
  }

  const offerIds = [
    ...new Set([
      ...[...offerIdByOrderId.values()].filter(Boolean),
      ...cancelLogs.map((log: any) => log.offerId.toString()),
    ]),
  ];
  if (!offerIds.length) return { dailyFees, dailyRevenue: dailyFees };

  const offers = await multiCallWithRetry(options, { target, abi: OFFERS_ABI, calls: offerIds, permitFailure: true });
  const exTokenByOfferId = new Map(offerIds.map((id, i) => [id, offers[i]?.exToken]));

  for (const log of settleLogs) addFee(dailyFees, exTokenByOfferId.get(offerIdByOrderId.get(log.orderId.toString())!), log.fee);
  for (const log of cancelLogs) addFee(dailyFees, exTokenByOfferId.get(log.offerId.toString()), log.refundFee);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    // 60% of fees go to $WHALES stakers, 40% to the protocol
    // https://docs.whales.market/tokenomics/usdwhales-staking
    dailyHoldersRevenue: dailyFees.clone(0.6),
    dailyProtocolRevenue: dailyFees.clone(0.4),
  };
};

// EVM chains only (solana pending — no decoded fee events)
const evmConfig = Object.fromEntries(Object.entries(config).filter(([, c]) => c.contract));

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: evmConfig,
  methodology: {
    Fees: "Settlement fees (SettleFilled/SettleCancelled) and offer-cancellation fees (CancelOffer) as emitted by the pre-market contracts, in the offer's settlement token.",
    Revenue: "All fees collected by the protocol.",
    HoldersRevenue: "60% of fees, distributed to $WHALES stakers.",
    ProtocolRevenue: "40% of fees, retained by the protocol.",
  },
};

export default adapter;
