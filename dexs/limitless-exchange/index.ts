import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'
import { addTokensReceived } from "../../helpers/token"

const contracts = {
  FPMM_FACTORY_V1: "0x8e50578aca3c5e2ef5ed2aa4bd66429b5e44c16e",
  FPMM_FACTORY: "0xc397d5d70cb3b56b26dd5c2824d49a96c4dabf50",

  // legacy
  CTF_EXCHANGE: "0xa4409d988ca2218d956beefd3874100f444f0dc3",
  NEG_RISK_CTF_EXCHANGE: "0x5a38afc17f7e97ad8d6c547ddb837e40b4aedfc6",
  FEE_MODULE: "0x6d8a7d1898306ca129a74c296d14e55e20aae87d",
  NEG_RISK_FEE_MODULE: "0x73fc1b1395ba964fea8705bff7ef8ea5c23cc661",

  // new main exchanges
  CTF_EXCHANGE_V2: "0x05c748e2f4dcde0ec9fa8ddc40de6b867f923fa5",
  NEG_RISK_CTF_EXCHANGE_V2: "0xe3e00ba3a9888d1de4834269f62ac008b4bb5c47",
  FEE_MODULE_V2: "0x5130c2c398F930c4f43B15635410047cBEa9D6EB",
  NEG_RISK_FEE_MODULE_V2: "0xfeb646D32a2A558359419a1C9c5dfb47fD92dADb",

  WRAPPED_COLLATERAL_1: "0x5d6C6a4fEA600E0b1A3Ab3eF711060310E27886A",
  WRAPPED_COLLATERAL_2: "0x8f4fA186E00E376a9054968a03172cfa1c2EedfE",

  CONDITIONAL_TOKENS: "0xC9c98965297Bc527861c898329Ee280632B76e18",
  FEE_RECIPIENT: "0x88eaf31f9fE392002e0E818527f8259af92287b1",

};

const abi = {
  FPMM_CREATION: 'event FixedProductMarketMakerCreation (address indexed creator, address fixedProductMarketMaker, address indexed conditionalTokens, address indexed collateralToken, bytes32[] conditionIds, uint256 fee)',
  FPMM_BUY: 'event FPMMBuy (address indexed buyer, uint256 investmentAmount, uint256 feeAmount, uint256 indexed outcomeIndex, uint256 outcomeTokensBought)',
  FPMM_SELL: 'event FPMMSell(address indexed seller, uint256 returnAmount, uint256 feeAmount, uint256 indexed outcomeIndex, uint256 outcomeTokensSold)',
  ORDERS_MATCHED: 'event OrdersMatched (bytes32 indexed takerOrderHash, address indexed takerOrderMaker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled)',
};

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const fpmmMarkets: any[] = [];

  const exchangeTargets = [
    contracts.CTF_EXCHANGE,
    contracts.NEG_RISK_CTF_EXCHANGE,
    contracts.CTF_EXCHANGE_V2,
    contracts.NEG_RISK_CTF_EXCHANGE_V2,
  ];

  const marketCreationLogs = await options.getLogs({
    eventAbi: abi.FPMM_CREATION,
    targets: [contracts.FPMM_FACTORY, contracts.FPMM_FACTORY_V1],
    fromBlock: 13549462,
    cacheInCloud: true,
    skipIndexer: true,
  });

  marketCreationLogs.forEach(market => {
    fpmmMarkets.push({ fixedProductMarketMaker: market.fixedProductMarketMaker, collateralToken: market.collateralToken })
  });

  const fpmmMarketMap: any = {}
  fpmmMarkets.forEach(market => {
    fpmmMarketMap[market.fixedProductMarketMaker.toLowerCase()] = market.collateralToken
  })

  const buyLogs = await options.getLogs({ eventAbi: abi.FPMM_BUY, noTarget: true, entireLog: true, parseLog: true })
  const sellLogs = await options.getLogs({ eventAbi: abi.FPMM_SELL, noTarget: true, entireLog: true, parseLog: true })

  buyLogs.forEach(log => {
    const collateralToken = fpmmMarketMap[log.address.toLowerCase()]
    if (!collateralToken) return;
    dailyVolume.addToken(collateralToken, log.args.investmentAmount);
  })
  sellLogs.forEach(log => {
    const collateralToken = fpmmMarketMap[log.address.toLowerCase()]
    if (!collateralToken) return;
    dailyVolume.addToken(collateralToken, log.args.returnAmount);
  })

  const orderMatchedLogs = await options.getLogs({
    eventAbi: abi.ORDERS_MATCHED,
    targets: exchangeTargets
  });

  orderMatchedLogs.forEach(order => {
    const { makerAssetId, makerAmountFilled, takerAmountFilled } = order;
    const makerIdStr = makerAssetId?.toString?.() ?? String(makerAssetId);
    const tradeVolume = makerIdStr === '0' ? makerAmountFilled : takerAmountFilled;
    dailyVolume.addToken(ADDRESSES.base.USDC, tradeVolume);
  });

  await addTokensReceived({
    options,
    balances: dailyFees,
    fromAdddesses: [contracts.CONDITIONAL_TOKENS, contracts.FEE_MODULE, contracts.FEE_MODULE_V2, contracts.WRAPPED_COLLATERAL_1, contracts.WRAPPED_COLLATERAL_2, contracts.NEG_RISK_FEE_MODULE, contracts.NEG_RISK_FEE_MODULE_V2],
    target: contracts.FEE_RECIPIENT,
    token: ADDRESSES.base.USDC
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
  };
}

const methodology = {
  Volume: "Limitless exchange orderbook and fpmm volume",
  Fees: "Orderbook and fpmm fee post fee refunds",
  Revenue: "Orderbook trading fee that goes to the protocol treasury",
  ProtocolRevenue: "Orderbook trading fee that goes to the protocol treasury",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  methodology,
  start: '2024-04-23'
};

export default adapter;
