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
}

const ismInsuranceAbis = {
  "totalSetPay": "function totalSetPay(uint256) view returns (uint256 orderID, uint256 poolUsdtAmount, uint256 reservoirUsdtAmount, uint256 reservoirMarqAmount, uint256 poolUsdtFee)",
  "ismOrder": "function ismOrder(uint256) view returns (address initOwner, address collateral, uint256 amount, address productAddress, uint256 productPrice, uint256 makeTime, uint256 expirationTime, uint8 kind, uint256 multiple, uint256 salt, uint256 sideProductOrderValue, uint256 tokenToNEIPrice)",
  "manageFeeRate": "function manageFeeRate() view returns (uint256)"
}

const batchSettlementEvent = "event BatchSettlement(uint256 id, uint256 time, uint256 price)"
const buyIsmInsuranceEvent = "event BuyISMInsurance(address user, address ism2Addr, address addr721, uint256 orderID, uint256 tokenID)"

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const contracts = MARQUE_CONTRACTS[options.chain]
  
  const batchSettlementLogs = await options.getLogs({
    target: contracts.ism2InsuranceAddress,
    eventAbi: batchSettlementEvent
  });
  const setIDs = batchSettlementLogs.map((log: any) => log.id);
  const setPayResuls = await options.api.multiCall({
    abi: ismInsuranceAbis['totalSetPay'],
    target: contracts.ism2InsuranceAddress,
    calls: setIDs,
  });
  
  for (const setPayResult of setPayResuls) {
    if (setPayResult && setPayResult.poolUsdtFee) {
      dailyFees.add(contracts.usdtAddress, setPayResult.poolUsdtFee);
    }
  }
  
  const buyIsmInsuranceLogs = await options.getLogs({
    target: contracts.ism2InsuranceAddress,
    eventAbi: buyIsmInsuranceEvent
  });
  const manageFeeRate = await options.api.call({
    target: contracts.ism2InsuranceAddress,
    abi: ismInsuranceAbis['manageFeeRate'],
  });
  const orderIDs = buyIsmInsuranceLogs.map(log => log.orderID);
  const orderInstances = await options.api.multiCall({
    abi: ismInsuranceAbis['ismOrder'],
    target: contracts.ism2InsuranceAddress,
    calls: orderIDs,
  });
  for (const orderInstance of orderInstances) {
    const orderFee = BigInt(orderInstance.amount) * BigInt(manageFeeRate) / BigInt(1e4);
    dailyFees.add(contracts.usdtAddress, orderFee);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
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
  pullHourly: true,
  methodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2024-12-01',
    }
  }
}

export default adapter;
