import { CHAIN } from "../../helpers/chains";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getPoolFees } from "../../helpers/aave";
import { addTokensReceived } from "../../helpers/token";
import { METRIC } from "../../helpers/metrics";

const methodology = {
  Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
  Revenue: 'Amount of fees go to Spark treasury.',
  SupplySideRevenue: 'Amount of fees distributed to suppliers.',
  ProtocolRevenue: 'Amount of fees go to Spark treasury.',
  HoldersRevenue: 'SPK tokens bought back by Spark treasury using protocol surplus.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all markets.',
    [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses.',
    [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors.',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'A portion of interest paid by borrowers from all markets.',
    [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses.',
    [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets.',
    [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses are distributed to lenders.',
    [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors are distributed to lenders.',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets are collected by Spark treasury.',
    [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses are colected by Spark treasury.',
    [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors are collected by Spark treasury.',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: 'Spark treasury buys back SPK tokens using protocol surplus revenue.'
  }
}

interface PoolConfig {
    version: number;
    lendingPoolProxy: string;
    dataProvider: string;
}

interface Config {
    pools: PoolConfig[]
}

const chainConfig: Record<string, Config> = {
    [CHAIN.ETHEREUM]: {
        pools: [
            {
            version: 3,
            lendingPoolProxy: '0xc13e21b648a5ee794902342038ff3adab66be987',
            dataProvider: '0xfc21d6d146e6086b8359705c8b28512a983db0cb',
            },
        ],
    },
    [CHAIN.XDAI]: {
        pools: [
            {
            version: 3,
            lendingPoolProxy: '0x2dae5307c5e3fd1cf5a72cb6f698f915860607e0',
            dataProvider: '0x2a002054a06546bb5a264d57a81347e23af91d18',
            },
        ],
    },
}

const buybackAddress = "0x797B010E0BABb493b8DEDD6F6ce5cc72778C2BF3"
const spk = "0xc20059e0317de91738d13af027dfc4a50781b066"

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const pools = chainConfig[options.chain].pools

    for (const pool of pools) {
        await getPoolFees(pool as any, options, { dailyFees, dailySupplySideRevenue, dailyProtocolRevenue });
    }

    const dailyHoldersRevenue = options.createBalances();
    if (options.chain === CHAIN.ETHEREUM) {
        const spkReceived = await addTokensReceived({ options, tokens: [spk], target: buybackAddress });
        dailyHoldersRevenue.addBalances(spkReceived, METRIC.TOKEN_BUY_BACK);
    }

    return {
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue,
    };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2023-03-08' },
    [CHAIN.XDAI]:     { fetch, start: '2023-09-06' }
  },
  methodology,
  breakdownMethodology,
}

export default adapter