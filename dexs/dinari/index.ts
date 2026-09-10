import { ethers } from "ethers";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Legacy (v1) OrderProcessors — open source:
// https://github.com/dinaricrypto/sbt-contracts
// https://github.com/dinaricrypto/sbt-contracts/blob/main/releases/v1.0.0/order_processor.json
const V2_PROCESSOR = "0xf60f689ec22fC2D485b3C734eFE58538cCc28766";
const V2_START_TS = 1780790400; // 2026-06-07

const config: Record<string, { processor: string; start: string }> = {
    [CHAIN.ETHEREUM]: { processor: "0xA8a48C202AF4E73ad19513D37158A872A4ac79Cb", start: "2024-05-22" },
    [CHAIN.ARBITRUM]: { processor: "0xFA922457873F750244D93679df0d810881E4131D", start: "2024-05-22" },
    [CHAIN.BASE]: { processor: "0x63FF43009f9ba3584aF2Ddfc3D5FE2cb8AE539c0", start: "2024-06-07" },
    [CHAIN.PLUME]: { processor: "0xc1571FEbBb6F8b62eDD0E4694714A382885d6bAB", start: "2025-04-22" },
   };

// ---- v1 events -----------------------------------------------------------------------
const ORDER_FILL =
  "event OrderFill(uint256 indexed id, address indexed paymentToken, address indexed assetToken, address requester, uint256 assetAmount, uint256 paymentAmount, uint256 feesTaken, bool sell)";

// ---- v2 events -----------------------------------------------------------------------
const ORDER_REQUESTED =
  "event OrderRequested(address indexed requester, address indexed assetToken, address indexed paymentToken, address recipient, uint8 orderType, uint8 side, uint256 assetAmount, uint256 paymentAmount, uint256 fee, string externalId, uint256 timestamp)";
const MANAGED_ORDER_REQUESTED =
  "event ManagedOrderRequested(address indexed requester, address indexed assetToken, address indexed paymentToken, address recipient, uint8 orderType, uint8 side, uint256 assetAmount, uint256 paymentAmount, uint256 fee, string externalId, uint256 timestamp)";

const SETTLED_TOPIC = "0x4907bbdd27eecc3fd5b0202f215bb36933e3601de096474cb7afb6f5c0b4aeb1";
const SETTLED_DATA_TYPES = ["uint256", "string", "uint256", "bytes32"];
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

const USD_1E18 = 1e18;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  // v1: raw payment-token amounts, priced by the balances helper
  if (options.startTimestamp < V2_START_TS) {
    const logs = await options.getLogs({ target: config[options.chain].processor, eventAbi: ORDER_FILL });
    for (const log of logs) {
      dailyVolume.add(log.paymentToken, log.paymentAmount);
      dailyFees.add(log.paymentToken, log.feesTaken, METRIC.TRADING_FEES);
    }
  }

  // v2: USD values normalised to 18 decimals on-chain
  if (options.endTimestamp > V2_START_TS) {
    const [requested, managed, settled] = await Promise.all([
      options.getLogs({ target: V2_PROCESSOR, eventAbi: ORDER_REQUESTED }),
      options.getLogs({ target: V2_PROCESSOR, eventAbi: MANAGED_ORDER_REQUESTED }),
      options.getLogs({ target: V2_PROCESSOR, topics: [SETTLED_TOPIC], entireLog: true }),
    ]);

    // Buy side: payment leg is committed at request time
    for (const log of [...requested, ...managed]) {
      const paymentAmount = Number(log.paymentAmount) / USD_1E18;
      const fee = Number(log.fee) / USD_1E18;
      if (paymentAmount > 0) dailyVolume.addUSDValue(paymentAmount);
      if (fee > 0) dailyFees.addUSDValue(fee, METRIC.TRADING_FEES);
    }

    // Sell side: proceeds paid out at settlement
    for (const log of settled) {
      const [amount] = abiCoder.decode(SETTLED_DATA_TYPES, log.data);
      const usd = Number(amount) / USD_1E18;
      if (usd > 0) dailyVolume.addUSDValue(usd);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const FEE_DESC = "Trading fees (flat + variable) charged on buy and sell orders of tokenized stocks (dShares).";

const methodology = {
  Fees: FEE_DESC,
  UserFees: `${FEE_DESC} All fees are paid by users.`,
  Revenue: `${FEE_DESC} All fees are revenue.`,
  ProtocolRevenue: `${FEE_DESC} All fees go to the protocol.`,
  Volume: "Payment-token notional of dShare orders (buys counted at request, sells at settlement).",
};

const breakdownMethodology = {
  Fees: { [METRIC.TRADING_FEES]: methodology.Fees },
  UserFees: { [METRIC.TRADING_FEES]: methodology.UserFees },
  Revenue: { [METRIC.TRADING_FEES]: methodology.Revenue },
  ProtocolRevenue: { [METRIC.TRADING_FEES]: methodology.ProtocolRevenue },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: config,
};

export default adapter;
