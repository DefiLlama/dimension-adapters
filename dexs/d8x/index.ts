import { Chain } from "../../adapters/types";
import {
  Adapter,
  FetchOptions,
  FetchResultVolume,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type TManagers = {
  [key in Chain]?: string;
};

const managerContracts: TManagers = {
  [CHAIN.ARBITRUM]: "0x8f8BccE4c180B699F81499005281fA89440D1e95",
  [CHAIN.BASE]: "0x7F3A4A9e5BB469F0F4977AA390760aF9EFCCd406",
  [CHAIN.BERACHAIN]: "0xb6329c7168b255Eca8e5c627b0CCe7A5289C8b7F",
  [CHAIN.POLYGON_ZKEVM]: "0xaB7794EcD2c8e9Decc6B577864b40eBf9204720f",
};

const ABDKToFloat = (x: bigint): number => {
  // ABDK: value(x) = x / 2 ** 64
  return Number(x) / 2 ** 64
};

const fetch = async ({ getLogs, chain, }: FetchOptions): Promise<FetchResultVolume> => {
  const managerAddr = managerContracts[chain];

  const [liquidations, trades] = await Promise.all(
    [
      "event Liquidate(uint24 perpetualId,address indexed liquidator,address indexed trader,int128 amountLiquidatedBC,int128 liquidationPrice,int128 newPositionSizeBC,int128 fFeeCC,int128 fPnlCC)",
      "event Trade(uint24 indexed perpetualId,address indexed trader,tuple(uint16 leverageTDR, uint16 brokerFeeTbps,uint24 iPerpetualId,address traderAddr,uint32 executionTimestamp,address brokerAddr,uint32 submittedTimestamp,uint32 flags,uint32 iDeadline, address executorAddr,int128 fAmount,int128 fLimitPrice, int128 fTriggerPrice,bytes brokerSignature) order,bytes32 orderDigest,int128 newPositionSizeBC,int128 price,int128 fFeeCC,int128 fPnlCC,int128 fB2C)",
    ].map((eventAbi) => getLogs({ target: managerAddr, eventAbi }))
  );

  const liquidationsVolume = liquidations
    .map(
      (e) =>
        Math.abs(ABDKToFloat(e.amountLiquidatedBC)) *
        ABDKToFloat(e.liquidationPrice)
    )
    .reduce((a: number, b: number) => a + b, 0);

  const tradesVolume = trades
    .map((e) => Math.abs(ABDKToFloat(e.order.fAmount)) * ABDKToFloat(e.price))
    .reduce((a: number, b: number) => a + b, 0);
  return {
    dailyVolume: liquidationsVolume + tradesVolume,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch, start: "2023-03-26",
    },
    [CHAIN.BASE]: {
      fetch, start: "2024-12-03",
    },
    [CHAIN.BERACHAIN]: {
      fetch, start: "2025-02-10",
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch, start: "2023-10-12",
    },
  },
};

export default adapter;
