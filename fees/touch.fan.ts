import { Adapter, FetchResultFees, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from '../helpers/friend-tech';

const fan_address = '0x9842114F1d9c5286A6b8e23cF0D8142DAb2B3E9b';
const touch_address = `0xC612eD7a1FC5ED084C967bD71F1e0F0a338Cf816`
const event_trade_fan = 'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 referrerEthAmount, uint256 supply, uint256 trader_balance, uint256 blockTime)'
const event_trade_touch = `event Trade(address trader,uint256 CommunityID,bool isBuy,uint256 shareAmount,uint256 ethAmount,uint256 protocolEthAmount,uint256 referrerEthAmount,uint256 supply,uint256 trader_balance,uint256 blockTime)`

const fetch: any = async (...args: any[]): Promise<FetchResultFees> => {
    // @ts-ignore
    const res: any = await getFeesExport(fan_address, [event_trade_fan])(...args);
    // @ts-ignore
    const res1: any = await getFeesExport(touch_address, [event_trade_touch])(...args);
    res.dailyFees.addBalances(res1.dailyFees);
    res.dailyRevenue.addBalances(res1.dailyRevenue);
    return res;
}


const adapter: Adapter = {
    adapter: {
        [CHAIN.ERA]: {
            fetch: fetch,
            start: '2023-10-28',
        },
    },
    version: 2,
    methodology: {
        Fees: "Fees paid by users while trading on social network.",
        Revenue: "All fees are revenue.",
    }
}

export default adapter; 