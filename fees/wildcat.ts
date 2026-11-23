import { ChainApi } from "@defillama/sdk";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// v2 markets only: v1 currentState() has no protocolFeeBips field
const V2_CURRENT_STATE = 'function currentState() view returns ((bool isClosed, uint128 maxTotalSupply, uint128 accruedProtocolFees, uint128 normalizedUnclaimedWithdrawals, uint104 scaledTotalSupply, uint104 scaledPendingWithdrawals, uint32 pendingWithdrawalExpiry, bool isDelinquent, uint32 timeDelinquent, uint16 protocolFeeBips, uint16 annualInterestBips, uint16 reserveRatioBips, uint112 scaleFactor, uint32 lastInterestAccruedTimestamp) state)'

const fetchFees = async (options: FetchOptions): Promise<FetchResultV2> => {
    const { api } = options
    const { markets, tokens } = await getMarkets(api)
    const apy = await getApy(options, markets, tokens)
    const supplies = await getTotalSupply(options, markets, tokens)
    const protocolFeeBips = await getProtocolFeeBips(api, markets)
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    supplies.forEach((supply: any) => {
        const _apy = apy.find((item: any) => item.market === supply.market)
        const dailyRate = (Number(_apy.annualInterestBips) / 10000) / 365
        const interest = Number(supply.totalSupply) * dailyRate
        // charged to the borrower on top of the interest, not taken out of it
        const protocolFee = interest * protocolFeeBips[supply.market] / 10000
        dailyFees.add(supply.token, interest, 'Borrow Interest')
        dailyFees.add(supply.token, protocolFee, 'Protocol Fee On Interest')
        dailySupplySideRevenue.add(supply.token, interest, 'Borrow Interest To Lenders')
        dailyRevenue.add(supply.token, protocolFee, 'Protocol Fee On Interest To Wildcat')
    })
    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue
    }
}


const getApy = async (options: FetchOptions, markets: string[], tokens: string[]): Promise<any> => {
    const { api } = options
    const apy = await Promise.all(markets.map(async (market) => {
        const annualInterestBips = await api.call({ abi: 'uint256:annualInterestBips', target: market })
        const annualRate = Number(annualInterestBips) / 10000;
        const dailyRate = annualRate / 365;
        const apy = (Math.pow(1 + dailyRate, 365) - 1) * 100;
        return {
            market,
            annualInterestBips,
            token: tokens[markets.indexOf(market)],
            apy
        }
    }))
    return apy
}

// scaledTotalSupply x scaleFactor, the balance that earns interest. totalDebts also holds
// unclaimed withdrawals and accrued protocol fees, which earn nothing.
const getTotalSupply = async (options: FetchOptions, markets: string[], tokens: string[]): Promise<any> => {
    const { api } = options
    const supplies = await Promise.all(markets.map(async (market) => {
        const totalSupply = await api.call({ abi: 'uint256:totalSupply', target: market })
        return {
            market,
            totalSupply,
            token: tokens[markets.indexOf(market)]
        }
    }))
    return supplies
}

// v1 markets expose protocolFeeBips() (0 on all of them), v2 markets only hold it in currentState()
const getProtocolFeeBips = async (api: ChainApi, markets: string[]): Promise<Record<string, number>> => {
    const versions = await api.multiCall({ abi: 'string:version', calls: markets })
    const v1 = markets.filter((_, i) => versions[i] === '1.0')
    const v2 = markets.filter((_, i) => versions[i] !== '1.0')
    const v1Fees = await api.multiCall({ abi: 'uint256:protocolFeeBips', calls: v1 })
    const v2States = await api.multiCall({ abi: V2_CURRENT_STATE, calls: v2 })
    const bips: Record<string, number> = {}
    v1.forEach((market, i) => { bips[market] = Number(v1Fees[i]) })
    v2.forEach((market, i) => { bips[market] = Number(v2States[i].protocolFeeBips) })
    return bips
}

async function getMarkets(api: ChainApi) {
    const markets = await api.call({ abi: 'address[]:getRegisteredMarkets', target: "0xfEB516d9D946dD487A9346F6fee11f40C6945eE4" })
    const tokens = await api.multiCall({ abi: 'address:asset', calls: markets })
    return { markets, tokens }
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: false, // fixed /365 daily amount, hourly would 24x
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetchFees,
            start: '2023-06-22',
        }
    },
    methodology: {
        Fees: 'Interest accrued by borrowers on the interest-bearing supply of every market, plus the protocol fee charged on top of it.',
        Revenue: 'Protocol fee charged on top of the interest, at the rate set on each market (5% of the interest on v2 markets with debt, none on v1).',
        ProtocolRevenue: 'Protocol fee charged on top of the interest, at the rate set on each market (5% of the interest on v2 markets with debt, none on v1).',
        SupplySideRevenue: 'All of the interest, which accrues to lenders.'
    },
    breakdownMethodology: {
        Fees: {
            'Borrow Interest': 'Annual interest rate of each market on its interest-bearing supply. Delinquency penalties are not included.',
            'Protocol Fee On Interest': 'Protocol fee of each market, a percentage of the interest owed by the borrower on top of it.',
        },
        Revenue: {
            'Protocol Fee On Interest To Wildcat': 'Protocol fee accrued to the Wildcat fee recipient.',
        },
        ProtocolRevenue: {
            'Protocol Fee On Interest To Wildcat': 'Protocol fee accrued to the Wildcat fee recipient.',
        },
        SupplySideRevenue: {
            'Borrow Interest To Lenders': 'All of the interest, credited to lenders through the scale factor of each market.',
        },
    }
}

export default adapter
