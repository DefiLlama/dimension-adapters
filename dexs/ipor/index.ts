import {BreakdownAdapter, FetchOptions} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";

interface IChainData {
  startTimestamp: number;
  iporProtocolRouter: string;
  stables: string[];
  stETHs: string[];
}

const chainsData: { [key: string]: IChainData } = {
  [CHAIN.ETHEREUM]: {
    startTimestamp: 1660662000,
    iporProtocolRouter: '0x16d104009964e694761c0bf09d7be49b7e3c26fd',
    stables: Object.values({
      MiltonDai: '0xEd7d74AA7eB1f12F83dA36DFaC1de2257b4e7523',
      MiltonUsdt: "0x28BC58e600eF718B9E97d294098abecb8c96b687",
      MiltonUsdc: "0x137000352B4ed784e8fa8815d225c713AB2e7Dc9",
    }),
    stETHs: []
  },
  [CHAIN.ARBITRUM]: {
      startTimestamp: 1708504270,
      iporProtocolRouter: '0x760Fa0aB719c4067D3A8d4727Cf07E8f3Bf118db',
      stables: [],
      stETHs: []
  }
}

const OpenSwapStablesTopic = "0x29267df9e90ec6126925ee936b6dc88a7da741b06bcd364f02acf9d38a7b97f7"
const openSwapStablesEventAbi = "event OpenSwap(uint256 indexed swapId, address indexed buyer, address asset, uint8 direction, (uint256 totalAmount, uint256 collateral, uint256 notional, uint256 openingFeeLPAmount, uint256 openingFeeTreasuryAmount, uint256 iporPublicationFee, uint256 liquidationDepositAmount) money, uint256 openTimestamp, uint256 endTimestamp, (uint256 iporIndexValue, uint256 ibtPrice, uint256 ibtQuantity, uint256 fixedInterestRate) indicator)"
const OpenSwapStEthTopic = '0x8534de2e250e111b80b34e6e91e687d99262e65a434f09c1433f9a9a21335beb'
const openSwapStETHEventAbi = "event OpenSwap(uint256 indexed swapId, address indexed buyer, address inputAsset, address asset, uint8 direction, (uint256 inputAssetTotalAmount, uint256 assetTotalAmount, uint256 collateral, uint256 notional, uint256 openingFeeLPAmount, uint256 openingFeeTreasuryAmount, uint256 iporPublicationFee, uint256 liquidationDepositAmount) amounts, uint256 openTimestamp, uint256 endTimestamp, (uint256 iporIndexValue, uint256 ibtPrice, uint256 ibtQuantity, uint256 fixedInterestRate) indicator)"

const fetch: any = async (timestamp: number, _: any, { chain, getLogs, createBalances, }: FetchOptions) => {
  const dailyNotionalVolume = createBalances()
  const { stables, stETHs, iporProtocolRouter } = chainsData[chain]
  stables.push(iporProtocolRouter)
  stETHs.push(iporProtocolRouter)

  const logsStables = await getLogs({ targets: stables, topic: OpenSwapStablesTopic, eventAbi: openSwapStablesEventAbi });
  const logsStETHs = await getLogs({ targets: stETHs, topic: OpenSwapStEthTopic, eventAbi: openSwapStETHEventAbi });
  const logs = logsStables.concat(logsStETHs)

  logs.forEach(log => {
    const balance = Number(log.money?.notional || log.amounts?.notional)
      dailyNotionalVolume.add(log.asset, balance)
  })

  return { timestamp, dailyVolume: dailyNotionalVolume };
};

const adapter: BreakdownAdapter = {
  breakdown: {
    "derivatives": {
      [CHAIN.ETHEREUM]: {
        fetch, start: chainsData[CHAIN.ETHEREUM].startTimestamp
      },
      [CHAIN.ARBITRUM]: {
        fetch, start: chainsData[CHAIN.ARBITRUM].startTimestamp
      }
    }
  }
}

export default adapter;
