import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const ADDRESSES = {
    friendTechShares1: '0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4',
    clubs: '0x201e95f275f39a5890c976dc8a3e1b4af114e635',
    friendToken: '0x0bd4887f7d41b35cd75dff9ffee2856106f86670',
}

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
    const dailyVolume = createBalances();

    const logs = await getLogs({
        target: ADDRESSES.friendTechShares1,
        eventAbi: "event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)",
    });
    logs.forEach((e: any) => dailyVolume.addGasToken(e.ethAmount));

    const clubBuy = await getLogs({
        target: ADDRESSES.clubs,
        eventAbi: "event Buy(uint256 indexed id, uint256 indexed pointsIn, uint256 indexed keysOut, uint256 protocolFee)",
    });
    const clubSell = await getLogs({
        target: ADDRESSES.clubs,
        eventAbi: "event Sell(uint256 indexed id, uint256 indexed pointsOut, uint256 indexed keysIn, uint256 protocolFee)",
    });
    clubBuy.forEach((e: any) => dailyVolume.add(ADDRESSES.friendToken, e.pointsIn));
    clubSell.forEach((e: any) => dailyVolume.add(ADDRESSES.friendToken, e.pointsOut));

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE],
    start: '2023-08-09',
};

export default adapter;
