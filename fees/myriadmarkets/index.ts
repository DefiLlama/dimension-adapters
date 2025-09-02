import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MARKETS = {
  [CHAIN.ABSTRACT]: '0x3e0F5F8F5Fb043aBFA475C0308417Bf72c463289',
  [CHAIN.LINEA]: '0x39e66ee6b2ddaf4defded3038e0162180dbef340',
}

const abi = {
  MarketActionTx: 'event MarketActionTx (address indexed user,uint8 indexed action, uint256 indexed marketId, uint256 outcomeId, uint256 shares, uint256 value, uint256 timestamp)',
  getMarketAltData: 'function getMarketAltData(uint256 marketId) external view returns(uint256 buyFee, bytes32 questionId ,uint256 questionIdUint,address token,uint256 buyTreasuryFee, address treasury ,address realitio ,uint256 realitioTimeout ,address manager)',
  getMarketFees: "function getMarketFees(uint256 marketId) view returns ((uint256 fee, uint256 treasuryFee, uint256 distributorFee) buyFees, (uint256 fee, uint256 treasuryFee, uint256 distributorFee) sellFees, address treasury, address distributor)",
}

async function fetch({ createBalances, chain, api, getLogs }: FetchOptions) {
  const market = MARKETS[chain]
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();

  const markets = await api.call({ abi: 'uint256[]:getMarkets', target: market });
  const marketData = await api.multiCall({ target: market, abi: abi.getMarketAltData, calls: markets })
  const marketFees = (await api.multiCall({ target: market, abi: abi.getMarketFees, calls: markets }))
  const marketMapping: any = {}
  markets.forEach((val, idx) => marketMapping[val] = {
    token: marketData[idx].token,
    fees: marketFees[idx]
  })

  marketFees.forEach(i => {
    i.buyFees = i.buyFees.map(j => Number(j) / 1e18)
  })
  const tradeLogs = await getLogs({ target: market, eventAbi: abi.MarketActionTx, });

  tradeLogs.forEach(({ action, marketId, value }) => {
    value = Number(value)
    action = Number(action)
    const { fees, token } = marketMapping[marketId]
    const isBuy = action === 0
    const feeKey = isBuy ? 'buyFees' : 'sellFees'
    const [fee, treasuryFee, distributorFee] = fees[feeKey]
    const totalFee = fee + treasuryFee + distributorFee

    switch (action) {
      case 0: // buy
      case 1: // sell
        dailyVolume.add(token, value);
        dailyFees.add(token, value * totalFee, isBuy ? 'BuyFee' : 'SellFee')
        dailySupplySideRevenue.add(token, value * distributorFee, 'DistributorFee')
        dailySupplySideRevenue.add(token, value * fee, 'LPFee')
        dailyRevenue.add(token, value * fee, 'TreasuryFee')
        break;
    }
  });


  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailyHoldersRevenue: 0,
  };
}

const methodology = {
  Fees: "fees charged on buys/sells (usually 3%)",
  Revenue: "1% fee to fund further development of Myriad Markets",
  ProtocolRevenue: "All revenue go to the protocol",
  SupplySideRevenue: "1% fee to reward liquidity providers & 1% fee to the distributors",
};

const breakdownMethodology = {
  Fees: {
    'BuyFee': 'Fee charged while buying',
    'SellFee': 'Fee charged while selling',
  },
  Revenue: {
    'TreasuryFee': 'Part of trading fee that goes to the protocol treasury',
  },
  SupplySideRevenue: {
    'DistributorFee': 'Cut from trading fees to the distributors',
    'LPFee': 'Cut from trading fees to the Liquidity providers',
  },
}


const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  breakdownMethodology,
  adapter: {
    [CHAIN.ABSTRACT]: { start: '2025-07-06', },
    [CHAIN.LINEA]: { start: '2025-08-01', },
  },
  methodology
};

export default adapter;