import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const configs: Record<string, { markets: Array<{ address: string, id: string }>, start?: string }> = {
  [CHAIN.ETHEREUM]: {
    markets: [
      {
        address: '0xa428723eE8ffD87088C36121d72100B43F11fb6A',
        id: '0xa597b5a36f6cc0ede718ba58b2e23f5c747da810bf8e299022d88123ab03340e',
      },
      {
        address: '0xc8Db629192a96D6840e88a8451F17655880A2e4D',
        id: '0xb3152ac00687cc9502b78ab452956f85cc89ac210deefda5dbff09f7f167b544',
      },
      {
        address: '0xc8Db629192a96D6840e88a8451F17655880A2e4D',
        id: '0x39d3bdd30bf4bcf4a4d3547f2484abe1e30a2dcd41ed83788b40e2720357ab76',
      },
      {
        address: '0x280ddD897F39C33fEf1CbF863B386Cb9a8e53a0e',
        id: '0xC48C055110D1692EDA1D45975BD80C75EE5E4D0AB6A5B6FFB949F2252C1B7791',
      },
      {
        address: '0x280ddD897F39C33fEf1CbF863B386Cb9a8e53a0e',
        id: '0xCA309C3ECE0FA3341779D8319F28BD9E08D3E08889E8AC58B4AC9001FBE458F3',
      },
    ],
    start: '2025-11-28',
  }
}

const ABIS = {
  idToMarketParams: 'function idToMarketParams(bytes32) view returns(address loanToken, address collateralToken, address oracle, address irm, uint256 ltv, uint256 lltv, address whitelist)',
  market: 'function market(bytes32) view returns(uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  AccrueInterestEvent: 'event AccrueInterest(bytes32 indexed id, uint256 prevBorrowRate, uint256 interest, uint256 feeShares)',
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const marketsParams = await options.api.multiCall({
    abi: ABIS.idToMarketParams,
    calls: configs[options.chain].markets.map(c => ({
      target: c.address,
      params: [c.id],
    })),
    permitFailure: true,
  })
  const markets = await options.api.multiCall({
    abi: ABIS.market,
    calls: configs[options.chain].markets.map(c => ({
      target: c.address,
      params: [c.id],
    })),
    permitFailure: true,
  })
  
  const logs = await options.getLogs({
    targets: configs[options.chain].markets.map(c => c.address),
    eventAbi: ABIS.AccrueInterestEvent,
    flatten: false,
  })
  
  for (let i = 0; i < marketsParams.length; i++) {
    if (marketsParams[i] && markets[i]) {
      const protocolFeeRate = Number(markets[i] ? markets[i].fee : 0) / 1e18;
      
      for (const log of logs[i]) {
        const interest = Number(log.interest);
        const protocolRevenue = Number(log.interest) * protocolFeeRate;
        const supplySideRevenue = interest - protocolRevenue;
  
        dailyFees.add(marketsParams[i].loanToken, interest, METRIC.BORROW_INTEREST);
        dailyRevenue.add(marketsParams[i].loanToken, protocolRevenue, METRIC.BORROW_INTEREST);
        dailySupplySideRevenue.add(marketsParams[i].loanToken, supplySideRevenue, METRIC.BORROW_INTEREST);
      }
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: fetch,
  adapter: configs,
  methodology: {
    Fees: 'Total borrow interest paid by borrowers.',
    Revenue: 'Share of borrow interest to Fira.',
    ProtocolRevenue: 'Share of borrow interest to Fira.',
    SupplySideRevenue: 'Amount of borrow interest are distributed to lenders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Total borrow interest paid by borrowers.',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Share of borrow interest to Fira.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Amount of borrow interest are distributed to lenders.',
    },
  },
};

export default adapter;
