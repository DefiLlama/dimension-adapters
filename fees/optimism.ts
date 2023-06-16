import { Adapter, ProtocolType } from "../adapters/types";
import { OPTIMISM, ETHEREUM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getBalance } from '@defillama/sdk/build/eth';
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { ChainBlocks } from "../adapters/types";
import BigNumber from "bignumber.js";
import { getTimestamp24hAgo } from "../utils/date";

async function totalSpent(todaysTimestamp:number, yesterdaysTimestamp:number, chainBlocks: ChainBlocks){
    const todaysBlock = (await getBlock(todaysTimestamp, ETHEREUM, chainBlocks));
    const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, ETHEREUM, {}));
    const graphQuerySpent = gql
        `query txFees {
        yesterday: totalSequencerGas(id: "optimism", block: { number: ${yesterdaysBlock} }) {
            totalETH
        }
        today: totalSequencerGas(id: "optimism", block: { number: ${todaysBlock} }) {
            totalETH
        }
      }`;
    const graphRes = await request("https://api.thegraph.com/subgraphs/name/0xngmi/sequencers", graphQuerySpent);
    return (new BigNumber(graphRes["today"].totalETH).minus(graphRes["yesterday"].totalETH)).div(1e18)
}

async function getFees(todaysTimestamp:number, yesterdaysTimestamp:number, chainBlocks: ChainBlocks){
    const todaysBlock = (await getBlock(todaysTimestamp, OPTIMISM, chainBlocks));
    const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, OPTIMISM, {}));

    const graphQuery = gql
        `query txFees {
        yesterday: withdrawns(id: "1", block: { number: ${yesterdaysBlock} }) {
            amount
        }
        today: withdrawns(id: "1", block: { number: ${todaysBlock} }) {
            amount
        }
      }`;

    const graphRes = await request("https://api.thegraph.com/subgraphs/name/ap0calyp/optimism-fee-withdrawn", graphQuery);

    const dailyFee = new BigNumber(graphRes["today"][0].amount).minus(graphRes["yesterday"][0].amount)

    const feeWallet = '0x4200000000000000000000000000000000000011';
    const l1FeeVault = '0x420000000000000000000000000000000000001a';
    const baseFeeVault = '0x4200000000000000000000000000000000000019';

    const [
        feeWalletStart,
        feeWalletEnd,
        l1FeeVaultStart,
        l1FeeVaultEnd,
        baseFeeVaultStart,
        baseFeeVaultEend
    ] = await Promise.all([
        getBalance({
            target: feeWallet,
            block: yesterdaysBlock,
            chain: "optimism"
        }),
        getBalance({
            target: feeWallet,
            block: todaysBlock,
            chain: "optimism"
        }),
        getBalance({
            target: l1FeeVault,
            block: yesterdaysBlock,
            chain: "optimism"
        }),
        getBalance({
            target: l1FeeVault,
            block: todaysBlock,
            chain: "optimism"
        }),
        getBalance({
            target: baseFeeVault,
            block: yesterdaysBlock,
            chain: "optimism"
        }),
        getBalance({
            target: baseFeeVault,
            block: todaysBlock,
            chain: "optimism"
        })
    ])
    const ethBalance = (new BigNumber(feeWalletEnd.output).minus(feeWalletStart.output))
        .plus((new BigNumber(l1FeeVaultEnd.output).minus(l1FeeVaultStart.output)))
        .plus((new BigNumber(baseFeeVaultEend.output).minus(baseFeeVaultStart.output)))

    return (ethBalance.plus(dailyFee)).div(1e18)
}

const feesAdapter = async (timestamp: number, chainBlocks: ChainBlocks) => {
    const todaysTimestamp = timestamp
    const yesterdaysTimestamp = getTimestamp24hAgo(timestamp)

    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const pricesObj: any = await getPrices([ethAddress], todaysTimestamp);
    const latestPrice = pricesObj[ethAddress]["price"]
    const [totalFees, totalSpentBySequencer] = await Promise.all([
        getFees(todaysTimestamp, yesterdaysTimestamp, chainBlocks),
        totalSpent(todaysTimestamp, yesterdaysTimestamp, chainBlocks)
    ]);
    const finalDailyFee = totalFees.times(latestPrice)
    const revenue = (totalFees.minus(totalSpentBySequencer)).times(latestPrice)

    return {
        timestamp,
        dailyFees: finalDailyFee.toString(),
        dailyRevenue: revenue.toString(),
        dailyHoldersRevenue: '0',
    };
}


const adapter: Adapter = {
    adapter: {
        [OPTIMISM]: {
            fetch: feesAdapter,
            start: async () => 1598671449,
        },
    },
    protocolType: ProtocolType.CHAIN
}

export default adapter;
