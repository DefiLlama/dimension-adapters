import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const USDM = '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7'

const MAOBS = [
    { address: '0xaD7e5CBfB535ceC8d2E58Dca17b11d9bA76f555E', base: '0xB0F70C0bD6FD87dbEb7C10dC692a2a6106817072', quote: USDM },  // BTC.b / USDm
    { address: '0x23469683e25b780DFDC11410a8e83c923caDF125', base: '0x4200000000000000000000000000000000000006', quote: USDM },  // WETH  / USDm
    { address: '0xDf1576c3C82C9f8B759C69f4cF256061C6Fe1f9e', base: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', quote: USDM },  // USDT0 / USDm
]

const EVENT_ABI = 'event RungFilled(address indexed taker, bool indexed isBuy, uint16 indexed rung, uint256 baseAmount, uint256 quoteAmount, uint256 priceE18)'

const FEE_DENOM = 1_000_000

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const rungFilledLogs = await options.getLogs({ targets: MAOBS.map(m => m.address), eventAbi: EVENT_ABI, flatten: false });
    const takerFees = await options.api.multiCall({ calls: MAOBS.map(m => ({ target: m.address })), abi: 'uint32:takerFee' });

    for (const [index, market] of MAOBS.entries()) {
        const logs = rungFilledLogs[index];
        const takerFee = takerFees[index];

        for (const log of logs) {
            dailyVolume.add(USDM, log.quoteAmount);

            if (log.isBuy) {
                const amount = Number(log.baseAmount)
                const fee = amount * takerFee / FEE_DENOM
                dailyFees.add(market.base, fee)
            } else {
                const amount = Number(log.quoteAmount)
                const fee = amount * takerFee / FEE_DENOM
                dailyFees.add(market.quote, fee)
            }
        }
    }

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
        dailySupplySideRevenue: 0,
    }
}

const methodology = {
    Fees: 'Taker fees charged on every trade. Buy orders pay fees in the base token, sell orders pay in the quote token.',
    UserFees: 'Same as Fees — all fees are paid by takers.',
    Revenue: '100% of taker fees are sent to the protocol fee collector.',
    ProtocolRevenue: 'All collected fees go to the protocol treasury.',
    SupplySideRevenue: 'CLP vault LPs earn from market-making spread, not from protocol fees.',
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    methodology,
    start: '2026-02-06',
    chains: [CHAIN.MEGAETH],
}

export default adapter
