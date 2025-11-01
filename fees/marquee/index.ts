
/*
fee and revenue

earn = coinPool.EarnAmount -  loseAmount + contractPool.EarnAmount - loseAmount
coinPool, err := blockchain.BlockChainClientSingle().CoinInsurance.ISMRewardPool.PoolInfo()
contractPool, err := blockchain.BlockChainClientSingle().ContractInsurance.RewardPool.PoolInfo()

fee = CsInsurance + ism Insuracance 

    ism Insuracance 
        uint256 fee = order.amount.mul(manageFeeRate).div(baseRate);

        emit BatchSettlement(setID, lastSettlementTime, tokenToNEDPrice);
        orderResult[id].poolUsdtFee
        totalSetPay[setID] = OrderResult(
                    setID,
                    poolUsdtAmount,
                    reservoirUsdtAmount,
                    reservoirMarqAmount,
                    poolUsdtFee
                );


*/
import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions, FetchV2 } from "../../adapters/types";
import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains";

interface IPool {
    coinPoolAddress: string;
    insurancePoolAddress: string;
    ism2InsuranceAddress: string;
    usdtAddress: string;
}

const MARQUE_CONTRACTS: { [key: string]: IPool } = {
    [CHAIN.ARBITRUM]: {
        coinPoolAddress: '0x304829862C52BB4A4066e0085395E93439FAC657',
        insurancePoolAddress: '0x5387733F5f457541a671Fe02923F146b4040530C',
        ism2InsuranceAddress: '0xa24a56A55e67A8442e71252F31344Aeb4C71ef8a', // Fixed spacing
        usdtAddress: ADDRESSES.arbitrum.USDT
    },
    // Add more chains here easily:
    // [CHAIN.ETHEREUM]: { ... },
    // [CHAIN.POLYGON]: { ... },
}

const coinPoolAbis = {
    "poolInfo": "function poolInfo() view returns (uint256 totalAmount, uint256 earnAmount, uint256 loseAmount, uint256 lastTakeAmount)",
}

const ismInsuranceAbis = {
    "totalSetPay": "function totalSetPay(uint256) view returns (uint256 orderID, uint256 poolUsdtAmount, uint256 reservoirUsdtAmount, uint256 reservoirMarqAmount, uint256 poolUsdtFee)",
    "ismOrder": "function ismOrder(uint256) view returns (address initOwner, address collateral, uint256 amount, address productAddress, uint256 productPrice, uint256 makeTime, uint256 expirationTime, uint8 kind, uint256 multiple, uint256 salt, uint256 sideProductOrderValue, uint256 tokenToNEIPrice)",
    "manageFeeRate": "function manageFeeRate() view returns (uint256)"
}

const insurancePoolAbis = {
    "poolInfo": "function poolInfo() view returns (uint256 totalAmount, uint256 earnAmount, uint256 loseAmount, uint256 maxTakeAmount)"
}

const batchSettlementEvent = "event BatchSettlement(uint256 id, uint256 time, uint256 price)"
const buyIsmInsuranceEvent = "event BuyISMInsurance(address user, address ism2Addr, address addr721, uint256 orderID, uint256 tokenID)"

// Helper functions for reusability
async function getPoolState(address: string, abi: string, chain: string, block?: number) {
    return await sdk.api2.abi.call({ 
        target: address, 
        abi, 
        chain, 
        block 
    });
}

async function getContractCall(target: string, abi: string, params: any[], chain: string) {
    return await sdk.api2.abi.call({
        target,
        abi,
        params,
        chain
    });
}

async function blockAtTs(ts: number, chain: string) {
    const { block } = await sdk.api.util.lookupBlock(ts, { chain: chain as any });
    return block;
}

// Helper function to get pool state differences
async function getPoolStateDifference(
    address: string, 
    abi: string, 
    chain: string, 
    fromBlock: number, 
    toBlock: number
) {
    try {
        const [preState, postState] = await Promise.all([
            getPoolState(address, abi, chain, fromBlock),
            getPoolState(address, abi, chain, toBlock)
        ]);
        
        const preEarn = preState.earnAmount - preState.loseAmount;
        const postEarn = postState.earnAmount - postState.loseAmount;
        
        return postEarn - preEarn;
    } catch (error) {
        console.log(`Error getting pool state difference for ${address}:`, error);
        return 0; // Return 0 if there's an error
    }
}

// Helper function to fetch and calculate fees from settlement events
async function getSettlementFees(
    options: FetchOptions,
    contracts: IPool
): Promise<bigint> {
    const batchSettlementLogs = await options.getLogs({
        target: contracts.ism2InsuranceAddress,
        eventAbi: batchSettlementEvent
    });
    const setIDs = batchSettlementLogs.map(log => log[0]);
    let totalFees = 0n;

    for (const setID of setIDs) {
        try {
            const setPayResult = await getContractCall(
                contracts.ism2InsuranceAddress,
                ismInsuranceAbis['totalSetPay'],
                [setID],
                options.chain
            );
            if (setPayResult.poolUsdtFee) {
                totalFees += BigInt(setPayResult.poolUsdtFee);
            }
        } catch (error) {
            console.log(`Error fetching totalSetPay for setID ${setID}:`, error);
        }
    }

    return totalFees;
}

// Helper function to fetch and calculate fees from insurance orders
async function getInsuranceOrderFees(
    options: FetchOptions,
    contracts: IPool
): Promise<bigint> {
    const buyIsmInsuranceLogs = await options.getLogs({
        target: contracts.ism2InsuranceAddress,
        eventAbi: buyIsmInsuranceEvent
    });
    
    // Get manageFeeRate
    let manageFeeRate = 0n;
    try {
        const feeRateResult = await getContractCall(
            contracts.ism2InsuranceAddress,
            ismInsuranceAbis['manageFeeRate'],
            [],
            options.chain
        );
        manageFeeRate = BigInt(feeRateResult);
    } catch (error) {
        console.log('Error fetching manageFeeRate:', error);
        return 0n;
    }

    
    const orderIDs = buyIsmInsuranceLogs.map(log => log.orderID);
    let totalOrderFees = 0n;
    const baseRate = 10000n;
    
    for (const orderID of orderIDs) {
        try {
            const orderInstance = await getContractCall(
                contracts.ism2InsuranceAddress,
                ismInsuranceAbis['ismOrder'],
                [orderID],
                options.chain
            );
            
            const orderFee = BigInt(orderInstance.amount) * manageFeeRate / baseRate;

            if (orderFee > 0n) {
                totalOrderFees += orderFee;
            }
        } catch (error) {
            console.log(`Error fetching ismOrder for orderID ${orderID}:`, error);
        }
    }

    return totalOrderFees;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
    const { startTimestamp, endTimestamp, chain } = options
    const contracts = MARQUE_CONTRACTS[chain]
    
    if (!contracts) {
        throw new Error(`Chain ${chain} not supported`)
    }

    const [fromBlock, toBlock] = await Promise.all([
        blockAtTs(startTimestamp - 360, chain),
        blockAtTs(endTimestamp - 1, chain)
    ])

    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()

    // Get pool state differences using helper functions
    const [coinPoolDiff, insurancePoolDiff] = await Promise.all([
        getPoolStateDifference(
            contracts.coinPoolAddress,
            coinPoolAbis['poolInfo'],
            chain,
            fromBlock,
            toBlock
        ),
        getPoolStateDifference(
            contracts.insurancePoolAddress,
            insurancePoolAbis['poolInfo'],
            chain,
            fromBlock,
            toBlock
        )
    ])

    // Add pool revenue differences
    if (insurancePoolDiff > 0) {
        dailyRevenue.add(contracts.usdtAddress, insurancePoolDiff.toString())
    }
    if (coinPoolDiff > 0) {
        dailyRevenue.add(contracts.usdtAddress, coinPoolDiff.toString())
    }

    // Get fees from settlement events and insurance orders
    const [settlementFees, orderFees] = await Promise.all([
        getSettlementFees(options, contracts),
        getInsuranceOrderFees(options, contracts)
    ])

    const totalFees = settlementFees + orderFees


    if (totalFees > 0n) {
        dailyFees.add(contracts.usdtAddress, totalFees.toString())
        dailyRevenue.add(contracts.usdtAddress, totalFees.toString())
    }

    return {
        timestamp: options.toTimestamp,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Fee collected from Option Buying and Settlement",
    Revenue: "Fund Pool Revenue + Fees are collected as revenue",
    ProtocolRevenue: "All fees are collected by protocol",
}

const adapter: Adapter = {
    version: 2,
    methodology,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2024-12-01',
        }
    }
}

export default adapter;
