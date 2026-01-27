import BigNumber from "bignumber.js";
import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN, } from "../../helpers/chains";
import { Chain } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { secondsInDay } from "../../utils/date";

type TAddress = {
  [s: string | Chain]: string;
}

const DBR_CONTRACTS: TAddress = {
  [CHAIN.ETHEREUM]: '0xAD038Eb671c44b853887A7E32528FaB35dC5D710',
}

const DOLA_CONTRACTS: TAddress = {
  [CHAIN.ETHEREUM]: '0x865377367054516e17014CcdED1e7d814EDC9ce4',
}

const DBR_DISTRIBUTOR_CONTRACTS: TAddress = {
  [CHAIN.ETHEREUM]: '0xdcd2D918511Ba39F2872EB731BB88681AE184244',
}

const DBR_AUCTION_CONTRACTS: TAddress = {
  [CHAIN.ETHEREUM]: '0x933cBE81313d9dD523dF6dC9B899A7AF8Ba073e3',
}

const DSA_CONTRACTS: TAddress = {
  [CHAIN.ETHEREUM]: '0xE5f24791E273Cb96A1f8E5B67Bc2397F0AD9B8B4',
}

const DBR_DISTRIBUTOR_START_BLOCK = 17272667;
const DSA_START_BLOCK = 19084053;
const DBR_AUCTION_START_BLOCK = 18940487;

// borrower has a deficit in DBR and is force-replenished
const FORCED_REPLENISHMENT_EVENT = 'event ForceReplenish(address indexed account, address indexed replenisher, address indexed market, uint amount, uint replenishmentCost, uint replenisherReward)';

const methodology = {
  UserFees: "DBR spent by borrowers.",
  Fees: "DBR spent by borrowers.",
  Revenue: "DBR distributed to INV stakers, the DOLA Savings Account, revenue from the DBR Virtual XY=K auction, and DBR forced replenishments to borrowers in DBR deficit.",
  ProtocolRevenue: "DBR distributed to INV stakers, the DOLA Savings Account, revenue from the DBR Virtual XY=K auction, and DBR forced replenishments to borrowers in DBR deficit.",  
  HoldersRevenue: "DBR streamed to INV stakers."
}

const getMarkets = async () => {
  const url = "https://www.inverse.finance/api/defillama/simple-market-list"  
  const data = await fetchURL(url, 3);
  return data.markets;
}

const getDbrPrices = async () => {
  const url = "https://www.inverse.finance/api/dbr-histo-prices"
  const data = await fetchURL(url, 3);
  return data.dbrPricesByUtcDates;
}

const toDbrUSDValue = (bn: BigNumber, dbrHistoPrice: number) => {
  return BigNumber(bn).dividedBy(1e18).multipliedBy(dbrHistoPrice).toNumber()
}

const fetch = (chain: Chain) => {
  return async ({ toTimestamp, createBalances, getLogs, getFromBlock, api }: FetchOptions) => {
    const dbr = DBR_CONTRACTS[chain];
    const dola = DOLA_CONTRACTS[chain];
    const dbrAuction = DBR_AUCTION_CONTRACTS[chain];
    const block = await getFromBlock();

    let annualizedFees = 0
    let annualizedRevenues = 0
    let holderAnnualizedRevenue = 0
    const replenishmentRevenue = createBalances()

    const [markets, dbrPrices] = await Promise.all([
      getMarkets(),
      // We use a custom api for DBR pricing as coingecko's pricing of DBR is/was usually not good due to missing the main Curve pools for DBR
      getDbrPrices(),
    ]);

    const dbrHistoPrice = dbrPrices.findLast(d => d.timestamp < (toTimestamp * 1000)).price;

    const existingMarkets = markets.filter(m => m.startingBlock <= block)

    // 1 DOLA debt = 1 DBR spent per year by borrowers
    const totalDebts = await api.multiCall({
      permitFailure: true,
      abi: 'function totalDebt() public view returns (uint)',
      calls: existingMarkets.map(m => ({ target: m.address })),
    });

    // DBR distributed to INV stakers
    if (block >= DBR_DISTRIBUTOR_START_BLOCK) {
      const invStakerRewardRate = await api.multiCall({
        abi: 'function rewardRate() public view returns (uint)',
        calls: [{ target: DBR_DISTRIBUTOR_CONTRACTS[chain] }],
      });

      holderAnnualizedRevenue += toDbrUSDValue(invStakerRewardRate[0], dbrHistoPrice) * secondsInDay * 365
      annualizedRevenues += holderAnnualizedRevenue      
    }

    // Virtual XY=K auction revenue
    if (block >= DBR_AUCTION_START_BLOCK) {
      const virtualAuctionDbrRatePerYear = await api.multiCall({
        abi: 'function dbrRatePerYear() public view returns (uint)',
        calls: [{ target: dbrAuction }],
      })
      annualizedRevenues += toDbrUSDValue(BigNumber(virtualAuctionDbrRatePerYear[0]), dbrHistoPrice)
    }

    // DOLA Savings Account revenue
    if (block >= DSA_START_BLOCK) {
      const dsaParams = { target: DSA_CONTRACTS[chain], chain }
      const [yearlyBudget, totalSupply, maxDbrPerDola] = await api.batchCall([
        {
          abi: 'function yearlyRewardBudget() public view returns (uint)',
          ...dsaParams,
        },
        {
          abi: 'function totalSupply() public view returns (uint)',
          ...dsaParams,
        },
        {
          abi: 'function maxRewardPerDolaMantissa() public view returns (uint)',
          ...dsaParams,
        },
      ])

      const maxBudget = BigNumber(maxDbrPerDola).multipliedBy(BigNumber(totalSupply)).dividedBy(1e18)
      const actualYearlyBudget = BigNumber(yearlyBudget).gt(maxBudget) ? maxBudget.toString() : yearlyBudget      
      annualizedRevenues += toDbrUSDValue(BigNumber(actualYearlyBudget), dbrHistoPrice)      
    }    

    totalDebts.forEach(d => {
      if(d) {
        annualizedFees += toDbrUSDValue(BigNumber(d), dbrHistoPrice)
      }      
    });
     
    let dailyRevenue = annualizedRevenues / 365;    
    const dailyHoldersRevenue = holderAnnualizedRevenue / 365;
    const dailyFees = annualizedFees / 365;

    // forced replenishments
    const replenishmentEvents = await getLogs({
      eventAbi: FORCED_REPLENISHMENT_EVENT,
      target: dbr,
    });    

    replenishmentEvents.forEach(e => {
      replenishmentRevenue.add(dola, e.replenishmentCost)
      replenishmentRevenue.subtractToken(dola, e.replenisherReward)
    })

    dailyRevenue += (await replenishmentRevenue.getUSDValue())    

    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,      
    }
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: '2022-12-11',
    },
  },
  methodology,
};

export default adapter;
