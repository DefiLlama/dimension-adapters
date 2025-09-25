import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'

const contracts = {
  FPMM_FACTORY_V1: "0x8e50578aca3c5e2ef5ed2aa4bd66429b5e44c16e",
  FPMM_FACTORY: "0xc397d5d70cb3b56b26dd5c2824d49a96c4dabf50",
  CTF_EXCHANGE: "0xa4409d988ca2218d956beefd3874100f444f0dc3",
  NEG_RISK_CTF_EXCHANGE: "0x5a38afc17f7e97ad8d6c547ddb837e40b4aedfc6",
  FEE_MODULE: "0x6d8a7d1898306ca129a74c296d14e55e20aae87d",
  NEG_RISK_FEE_MODULE: "0x73fc1b1395ba964fea8705bff7ef8ea5c23cc661"
};

const abi = {
  FPMM_CREATION: 'event FixedProductMarketMakerCreation (address indexed creator, address fixedProductMarketMaker, address indexed conditionalTokens, address indexed collateralToken, bytes32[] conditionIds, uint256 fee)',
  FPMM_BUY: 'event FPMMBuy (address indexed buyer, uint256 investmentAmount, uint256 feeAmount, uint256 indexed outcomeIndex, uint256 outcomeTokensBought)',
  FPMM_SELL: 'event FPMMSell(address indexed seller, uint256 returnAmount, uint256 feeAmount, uint256 indexed outcomeIndex, uint256 outcomeTokensSold)',
  ORDERS_MATCHED: 'event OrdersMatched (bytes32 indexed takerOrderHash, address indexed takerOrderMaker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled)',
  FEE_CHARGED: "event FeeCharged (address indexed receiver, uint256 tokenId, uint256 amount)",
  FEE_REFUNDED: "event FeeRefunded (address token, address to, uint256 id, uint256 amount)"
};

async function fetch(_: any, _1: any, options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const fpmmMarkets: any[] = [];

  const marketCreationLogs = await options.getLogs({
    eventAbi: abi.FPMM_CREATION,
    targets: [contracts.FPMM_FACTORY, contracts.FPMM_FACTORY_V1],
    fromBlock: 13549462,
    cacheInCloud: true,
    skipIndexer: true,
  });

  const buyLogs = await options.getLogs({ eventAbi: abi.FPMM_BUY, noTarget: true, entireLog: true, parseLog: true })
  const sellLogs = await options.getLogs({ eventAbi: abi.FPMM_SELL, noTarget: true, entireLog: true, parseLog: true })

  const orderMatchedLogs = await options.getLogs({
    eventAbi: abi.ORDERS_MATCHED,
    targets: [contracts.CTF_EXCHANGE, contracts.NEG_RISK_CTF_EXCHANGE]
  });

  const feeChargedLogs = await options.getLogs({
    eventAbi: abi.FEE_CHARGED,
    targets: [contracts.CTF_EXCHANGE, contracts.NEG_RISK_CTF_EXCHANGE]
  });

  const feeRefundedLogs = await options.getLogs({
    eventAbi: abi.FEE_REFUNDED,
    targets: [contracts.FEE_MODULE, contracts.NEG_RISK_FEE_MODULE]
  });



  marketCreationLogs.forEach(market => {
    fpmmMarkets.push({ fixedProductMarketMaker: market.fixedProductMarketMaker, collateralToken: market.collateralToken })
  });
  
  const fpmmMarketMap: any = {}
  fpmmMarkets.forEach(market => {
    fpmmMarketMap[market.fixedProductMarketMaker.toLowerCase()] = market.collateralToken
  })

  buyLogs.forEach(log => {
    const collateralToken = fpmmMarketMap[log.source.toLowerCase()]
    if (!collateralToken) return;
    dailyVolume.addToken(collateralToken, log.args.investmentAmount);
    dailySupplySideRevenue.addToken(collateralToken, log.args.feeAmount)
    dailyFees.addToken(collateralToken, log.args.feeAmount)
  })
  sellLogs.forEach(log => {
    const collateralToken = fpmmMarketMap[log.source.toLowerCase()]
    if (!collateralToken) return;
    dailyVolume.addToken(collateralToken, log.args.returnAmount);
    dailySupplySideRevenue.addToken(collateralToken, log.args.feeAmount)
    dailyFees.addToken(collateralToken, log.args.feeAmount)
  })

  orderMatchedLogs.forEach(order => {
    const { makerAssetId, makerAmountFilled, takerAmountFilled } = order;
    const tradeVolume = makerAssetId === 0 ? makerAmountFilled : takerAmountFilled;
    dailyVolume.addToken(ADDRESSES.base.USDC, tradeVolume);
  });

  feeChargedLogs.forEach(feeCharge => {
    dailyRevenue.addToken(ADDRESSES.base.USDC, feeCharge.amount);
    dailyFees.addToken(ADDRESSES.base.USDC, feeCharge.amount);
  });



  feeRefundedLogs.forEach(feeRefund => {
    dailyRevenue.subtractToken(feeRefund.token, feeRefund.amount);
    dailyFees.subtractToken(feeRefund.token, feeRefund.amount);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue
  };
}

const methodology = {
  Volume: "Limitless exchange orderbook and fpmm volume",
  Fees: "Orderbook and fpmm fee post fee refunds",
  Revenue: "Orderbook trading fee that goes to the protocol treasury",
  ProtocolRevenue: "Orderbook trading fee that goes to the protocol treasury",
  SupplySideRevenue: "FPMM trading fees goes to the Liquidity providers",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BASE],
  methodology,
  start: '2024-04-23'
};

export default adapter;