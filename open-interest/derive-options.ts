import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

async function fetch() {
    let openInterestAtEnd = 0;
    const [statsData, currencyData] = await Promise.all(
        [
            fetchURL("https://api.lyra.finance/public/all_statistics"),
            fetchURL("https://api.lyra.finance/public/get_all_currencies")
        ]
    );
    
    const statsList = statsData.result.filter((statsEntry: any) => statsEntry.instrument_type === 'option');
    const currencyList = currencyData.result;

    statsList.forEach((statsEntry: any) => {
        const currentPrice = currencyList.filter((currencyEntry: any) => statsEntry.currency === currencyEntry.currency).at(0)?.spot_price ?? 0;
        openInterestAtEnd += (statsEntry.open_interest * currentPrice * 2);
    });

    return { openInterestAtEnd }
}

export default {
    chains: [CHAIN.LYRA],
    fetch,
    runAtCurrTime: true,
}