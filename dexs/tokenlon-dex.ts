import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const BPS: bigint = BigInt(10_000);
const ZERO: bigint = BigInt(0);

const abis = {
  FillOrder:
    'event FillOrder(string source, bytes32 indexed transactionHash, bytes32 indexed orderHash, address indexed userAddr, address takerAssetAddr, uint256 takerAssetAmount, address makerAddr, address makerAssetAddr, uint256 makerAssetAmount, address receiverAddr, uint256 settleAmount, uint16 feeFactor)',
  Swapped:
    'event Swapped(string source, bytes32 indexed transactionHash, address indexed userAddr, address takerAssetAddr, uint256 takerAssetAmount, address makerAddr, address makerAssetAddr, uint256 makerAssetAmount, address receiverAddr, uint256 settleAmount, uint256 receivedAmount, uint16 feeFactor, uint16 subsidyFactor)',
  FilledRFQ:
    'event FilledRFQ(bytes32 indexed offerHash,address indexed user,address indexed maker,address takerToken,uint256 takerTokenAmount,address makerToken,uint256 makerTokenAmount,address recipient,uint256 settleAmount,uint256 feeFactor)',
  FillOrderByRFQ:
    'event FillOrder( string source,bytes32 indexed transactionHash,bytes32 indexed orderHash,address indexed userAddr,address takerAssetAddr,uint256 takerAssetAmount,address makerAddr,address makerAssetAddr,uint256 makerAssetAmount,address receiverAddr,uint256 settleAmount,uint16 feeFactor)',
  SwappedV2:
    'event Swapped((string source, bytes32 transactionHash, uint256 settleAmount, uint256 receivedAmount, uint16 feeFactor, uint16 subsidyFactor), (address makerAddr, address takerAssetAddr, address makerAssetAddr, uint256 takerAssetAmount, uint256 makerAssetAmount, address userAddr, address receiverAddr, uint256 salt, uint256 deadline) order)',
};

function toBigInt(value: any): bigint {
  return BigInt(value.toString());
}

function getFeeFromSettlement(grossAmount: any, settleAmount: any): bigint {
  const gross = toBigInt(grossAmount);
  const settled = toBigInt(settleAmount);
  return gross > settled ? gross - settled : ZERO;
}

function getAmmWrapperFee(log: any, makerAmount: any): bigint {
  if (!log || makerAmount == null) return ZERO;

  const received = toBigInt(log.receivedAmount);
  const settled = toBigInt(log.settleAmount);
  const maker = toBigInt(makerAmount);
  const feeFactor = toBigInt(log.feeFactor);

  if (feeFactor === ZERO || received <= maker) return ZERO;

  const expectedSettle = received * (BPS - feeFactor) / BPS;
  if (settled !== expectedSettle) return ZERO;

  return received > settled ? received - settled : ZERO;
}

const fetchEthereum = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const pmmLogs = await getLogs({
    target: '0x8D90113A1e286a5aB3e496fbD1853F265e5913c6',
      eventAbi: abis.FillOrder,
  });
  const rfqv1Logs = await getLogs({
    target: '0xfD6C2d2499b1331101726A8AC68CCc9Da3fAB54F',
      eventAbi: abis.FillOrderByRFQ,
  });
  const rfqv2Logs = await getLogs({
    target: '0x91c986709bb4fe0763edf8e2690ee9d5019bea4a',
      eventAbi: abis.FilledRFQ,
  });
  const ammV1Logs = await getLogs({
    target: '0x4a14347083B80E5216cA31350a2D21702aC3650d',
      eventAbi: abis.Swapped,
  });
  const ammV2Logs = await getLogs({
    target: '0x4a14347083B80E5216cA31350a2D21702aC3650d',
      eventAbi: abis.SwappedV2,
  });

  [ammV1Logs, rfqv1Logs, pmmLogs].flat().forEach((log: any) => {
    dailyVolume.add(log.makerAssetAddr, log.makerAssetAmount);
  });

  [ammV2Logs].flat().forEach((log: any) => {
    const order = log.order ?? log[1];
    if (order) dailyVolume.add(order.makerAssetAddr, order.makerAssetAmount);
  });

  [rfqv2Logs].flat().forEach((log: any) => {
    dailyVolume.add(log.makerToken, log.makerTokenAmount);
  });

  [rfqv1Logs, pmmLogs].flat().forEach((log: any) => {
    const fee = getFeeFromSettlement(log.makerAssetAmount, log.settleAmount);
    if (fee > ZERO) dailyFees.add(log.makerAssetAddr, fee, METRIC.SWAP_FEES);
  });

  rfqv2Logs.forEach((log: any) => {
    const fee = getFeeFromSettlement(log.makerTokenAmount, log.settleAmount);
    if (fee > ZERO) dailyFees.add(log.makerToken, fee, METRIC.SWAP_FEES);
  });

  ammV1Logs.forEach((log: any) => {
    const fee = getAmmWrapperFee(log, log.makerAssetAmount);
    if (fee > ZERO) dailyFees.add(log.makerAssetAddr, fee, METRIC.SWAP_FEES);
  });

  ammV2Logs.forEach((log: any) => {
    const quote = log.quote ?? log[0];
    const order = log.order ?? log[1];
    if (!order) return;

    const fee = getAmmWrapperFee(quote, order.makerAssetAmount);
    if (fee > ZERO) dailyFees.add(order.makerAssetAddr, fee, METRIC.SWAP_FEES);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: 'Tokenlon AMM fees retained from maker-side swap proceeds on Ethereum PMM, RFQ, RFQv2 and AMMWrapperWithPath fills.',
  UserFees: 'Fees paid by users as the difference between the gross maker-side amount and the emitted settled amount.',
  Revenue: 'Collected Tokenlon AMM fees are counted as protocol revenue.',
  ProtocolRevenue: 'Collected Tokenlon AMM fees are counted as protocol revenue.',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "PMM and RFQ fees are maker amount minus settle amount. AMMWrapperWithPath fees are received amount minus settle amount when the wrapper's received-amount fee path applies.",
  },
  Revenue: {
    [METRIC.SWAP_FEES]:
      "PMM and RFQ fees are maker amount minus settle amount. AMMWrapperWithPath fees are received amount minus settle amount when the wrapper's received-amount fee path applies.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: '2020-12-15',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
