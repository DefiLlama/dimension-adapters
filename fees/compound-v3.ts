import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const CometAbis: any = {
  baseToken: 'address:baseToken',
  totalSupply: 'uint256:totalSupply',
  totalBorrow: 'uint256:totalBorrow',
  getUtilization: 'uint256:getUtilization',
  getBorrowRate: 'function getBorrowRate(uint256 utilization) view returns (uint256 borrowRate)',
}

const CometAddresses: {[key: string]: Array<string>} = {
  [CHAIN.ETHEREUM]: [
    '0xc3d688b66703497daa19211eedff47f25384cdc3',
    '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
    '0x3afdc9bca9213a35503b077a6072f3d0d5ab0840',
    '0x3D0bb1ccaB520A66e607822fC55BC921738fAFE3',
    '0x5D409e56D886231aDAf00c8775665AD0f9897b56',
    '0xe85Dc543813B8c2CFEaAc371517b925a166a9293',
  ],
  [CHAIN.POLYGON]: [
    '0xF25212E676D1F7F89Cd72fFEe66158f541246445',
    '0xaeb318360f27748acb200ce616e389a6c9409a07',
  ],
  [CHAIN.ARBITRUM]: [
    '0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA',
    '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
    '0x6f7d514bbd4aff3bcd1140b7344b32f063dee486',
    '0xd98be00b5d27fc98112bde293e487f8d4ca57d07',
  ],
  [CHAIN.BASE]: [
    '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
    '0xb125E6687d4313864e53df431d5425969c15Eb2F',
    '0x46e6b214b524310239732D51387075E0e70970bf',
    '0x784efeB622244d2348d4F2522f8860B96fbEcE89',
    '0x2c776041CCFe903071AF44aa147368a9c8EEA518',
  ],
  [CHAIN.SCROLL]: [
    '0xB2f97c1Bd3bf02f5e74d13f02E3e26F93D77CE44',
  ],
  [CHAIN.OPTIMISM]: [
    '0x2e44e174f7D53F0212823acC11C01A11d58c5bCB',
    '0x995e394b8b2437ac8ce61ee0bc610d617962b214',
    '0xe36a30d249f7761327fd973001a32010b521b6fd',
  ],
  [CHAIN.MANTLE]: [
    '0x606174f62cd968d8e684c645080fa694c1D7786E',
  ],
  [CHAIN.UNICHAIN]: [
    '0x2c7118c4C88B9841FCF839074c26Ae8f035f2921',
  ],
  [CHAIN.LINEA]: [
    '0x8D38A3d6B3c3B7d96D6536DA7Eef94A9d7dbC991',
  ],
}

const fetchComets: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances()

  const assets = await options.api.multiCall({
    abi: CometAbis.baseToken,
    calls: CometAddresses[options.chain],
    permitFailure: true,
  })
  const us = await options.api.multiCall({
    abi: CometAbis.getUtilization,
    calls: CometAddresses[options.chain],
    permitFailure: true,
  })
  const totalBorrows = await options.api.multiCall({
    abi: CometAbis.totalBorrow,
    calls: CometAddresses[options.chain],
    permitFailure: true,
  })
  const getBorrowRates = await options.api.multiCall({
    abi: CometAbis.getBorrowRate,
    calls: CometAddresses[options.chain].map((address: string, index: number) => {
      return {
        target: address,
        params: [us[index].toString()],
      }
    }),
    permitFailure: true,
  })

  const DAY = (options.fromTimestamp && options.toTimestamp) ? options.toTimestamp - options.fromTimestamp : 24 * 60 * 60
  for (let i = 0; i < assets.length; i++) {
    if (assets[i]) {
      dailyFees.add(assets[i], Number(getBorrowRates[i]) * Number(totalBorrows[i]) * DAY / 1e18, METRIC.BORROW_INTEREST)
    }
  }

  return {
    dailyFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchComets,
      start: '2022-08-14',
    },
    [CHAIN.POLYGON]: {
      fetch: fetchComets,
      start: '2023-02-19',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchComets,
      start: '2023-05-05',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchComets,
      start: '2024-04-07',
    },
    [CHAIN.BASE]: {
      fetch: fetchComets,
      start: '2023-08-05',
    },
    [CHAIN.SCROLL]: {
      fetch: fetchComets,
      start: '2024-02-17',
    },
    [CHAIN.MANTLE]: {
      fetch: fetchComets,
      start: '2024-10-24',
    },
    [CHAIN.UNICHAIN]: {
      fetch: fetchComets,
      start: '2025-02-19',
    },
    [CHAIN.LINEA]: {
      fetch: fetchComets,
      start: '2025-02-01',
    },
  },
  version: 2,
  methodology: {
    Fees: 'Total borrow interest paid by borrowers.',
    Revenue: 'No borrow interest to Compound treasury.',
    ProtocolRevenue: 'No borrow interest to Compound treasury.',
    SupplySideRevenue: 'All borrow interest paid to lenders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Interest accrued daily on all outstanding borrows across Compound V3 markets, calculated using current borrow rates and utilization.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'All borrow interest distributed to lenders who supply capital to Compound V3 markets.',
    },
  }
};

export default adapter;