import { METRIC } from "../../helpers/metrics";
import { BaseAdapterChainConfig, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { Balances } from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { GearboxAbis, IGearboxService } from "../gearbox/configs";
import { CuratorConfig, getCuratorExport } from "../../helpers/curators";

const INTEREST_FEE = 0.0025 // 0.25%

// KPK's v3 Gearbox markets on Ethereum mainnet
const KPK_V3_POOLS: IGearboxService[] = [
  {
    version: 3,
    pool: '0x9396dcbf78fc526bb003665337c5e73b699571ef', // ETH
  },
  {
    version: 3,
    pool: '0xa9d17f6d3285208280a1fd9b94479c62e0aaba64', // wstETH
  },
]

// KPK's Morpho vaults
const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morpho: [
        "0xe108fbc04852B5df72f9E44d7C29F47e7A993aDd", //Morpho USDC Prime
        "0x0c6aec603d48eBf1cECc7b247a2c3DA08b398DC1", //Morpho EURC Yield
        "0xd564F765F9aD3E7d2d6cA782100795a885e8e7C8", //Morpho ETH Prime
        "0x4Ef53d2cAa51C447fdFEEedee8F07FD1962C9ee6", //Morpho v2 USDC 
        "0xa877D5bb0274dcCbA8556154A30E1Ca4021a275f", //Morpho v2 EURC
        "0xbb50a5341368751024ddf33385ba8cf61fe65ff9", //Morpho v2 ETH      
      ],
    },
    arbitrum: {
      morpho: [
        "0x2C609d9CfC9dda2dB5C128B2a665D921ec53579d", //Morpho USDC Yield
      ],
    },
  }
}

const morphoAdapter = getCuratorExport(curatorConfig);

interface ProcessBalances {
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailyProtocolRevenue: Balances;
  dailySupplySideRevenue: Balances;
}

async function processV3Services(options: FetchOptions, balances: ProcessBalances, services: Array<IGearboxService>) {
  const assets = await options.api.multiCall({
    abi: 'address:asset',
    calls: services.map(service => service.pool),
    permitFailure: true,
  })
  const totalAssets = await options.api.multiCall({
    abi: 'uint256:totalAssets',
    calls: services.map(service => service.pool),
    permitFailure: true,
  })
  const decimals = await options.api.multiCall({
    abi: 'uint8:decimals',
    calls: services.map(service => service.pool),
    permitFailure: true,
  })

  const cumulativeIndexBefore = await options.fromApi.multiCall({
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    calls: services.map((service, index) => {
      return {
        target: service.pool,
        params: [String(10**Number(decimals[index]))],
      }
    }),
    permitFailure: true,
  })
  const cumulativeIndexAfter = await options.toApi.multiCall({
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    calls: services.map((service, index) => {
      return {
        target: service.pool,
        params: [String(10**Number(decimals[index]))],
      }
    }),
    permitFailure: true,
  })

  // count interest from growth CumulativeIndex for fees and supplySideRevenue
  for (let i = 0; i < services.length; i++) {
    const token = assets[i]
    if (token) {
      const totalTokenBalance = Number(totalAssets[i])
      const growthCumulativeIndex = Number(cumulativeIndexAfter[i]) - Number(cumulativeIndexBefore[i])
      const growthInterest = growthCumulativeIndex * totalTokenBalance / (10**Number(decimals[i]))
      const growthInterestFee = growthInterest * INTEREST_FEE

      // we count growthInterest as fees
      balances.dailyFees.add(token, growthInterest, METRIC.BORROW_INTEREST)
      balances.dailySupplySideRevenue.add(token, growthInterest - growthInterestFee, METRIC.BORROW_INTEREST)

      // revenue source 1: from borrow interest share
      balances.dailyRevenue.add(token, growthInterestFee, METRIC.BORROW_INTEREST)
      balances.dailyProtocolRevenue.add(token, growthInterestFee, METRIC.BORROW_INTEREST)
    }
  }

  // revenue source 2: from profit & loss
  // when credit managers repay loans, there are profit or loss
  // protocol collects profits as revenue and will pay for loss
  const repayEvents = await options.getLogs({
    eventAbi: GearboxAbis.PoolRepay,
    targets: services.map(service => service.pool),
    flatten: false,
  });

  for (let i = 0; i < services.length; i++) {
    const token = assets[i];
    const events = repayEvents[i] || [];
    for (const event of events) {
      // we add profit & loss to revenue
      balances.dailyFees.add(token, Number(event.profit), 'Performance Profit')
      balances.dailyFees.add(token, Number(event.loss), 'Performance Loss')
      balances.dailyRevenue.add(token, Number(event.profit), 'Performance Profit')
      balances.dailyRevenue.add(token, Number(event.loss), 'Performance Loss')
      balances.dailyProtocolRevenue.add(token, Number(event.profit), 'Performance Profit')
      balances.dailyProtocolRevenue.add(token, Number(event.loss), 'Performance Loss')
    }
  }
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // Process Gearbox v3 pools
  await processV3Services(options, { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }, KPK_V3_POOLS)

  // Process Morpho vaults
  const morphoChainAdapter = (morphoAdapter.adapter as any)?.[options.chain];
  if (morphoChainAdapter?.fetch) {
    const morphoResult = await morphoChainAdapter.fetch(options);
    if (morphoResult) {
      // Merge Morpho results into balances
      if (morphoResult.dailyFees instanceof Balances) {
        dailyFees.addBalances(morphoResult.dailyFees);
      }
      if (morphoResult.dailyRevenue instanceof Balances) {
        dailyRevenue.addBalances(morphoResult.dailyRevenue);
      }
      if (morphoResult.dailyProtocolRevenue instanceof Balances) {
        dailyProtocolRevenue.addBalances(morphoResult.dailyProtocolRevenue);
      }
      if (morphoResult.dailySupplySideRevenue instanceof Balances) {
        dailySupplySideRevenue.addBalances(morphoResult.dailySupplySideRevenue);
      }
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
}

const methodology = {
  Fees: 'Include borrow interest, performance profit & loss paid by borrowers on KPK\'s v3 Gearbox markets, and fees from Morpho vaults.',
  Revenue: 'Amount of fees go to Gearbox treasury from Gearbox markets, and revenue from Morpho vaults.',
  SupplySideRevenue: 'Amount of fees distributed to passive lenders on Gearbox markets, and supply side revenue from Morpho vaults.',
  ProtocolRevenue: 'Amount of fees go to Gearbox treasury from Gearbox markets, and protocol revenue from Morpho vaults.',
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM],
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: 1731456000, // 2024-11-13
    },
    [CHAIN.ARBITRUM]: {
      start: 1731456000, // 2024-11-13
    }
  },
  allowNegativeValue: true,
}

export default adapter;
