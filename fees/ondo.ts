import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import * as sdk from '@defillama/sdk'
import * as solana from '../helpers/solana'
import axios from "axios"
import { getCoinSupply } from "../helpers/aptos"
import { getObject } from '../helpers/sui'

/**
 * 
 * Ondo manages and issues two stable assets: USDY and OUSG, both work in the same mechanism
 * 
 * The price of OUSG, USDY increase from accrued yields, we count these yields are fees
 * 
 * No management fees on Ondo for now:
 * https://docs.ondo.finance/qualified-access-products/ousg/fees-and-taxes#what-fees-does-ousg-charge
 * https://docs.ondo.finance/general-access-products/usdy/faq/economics-and-fees#what-fees-does-usdy-charge
 */

const methodology = {
  Fees: 'Total yields were collected by investment assets.',
  Revenue: 'Total yields were distributed to investors and Ondo protocol.',
  PerotocolRevenue: 'Total yields were collected by Ondo protocol.',
  SupplySideRevenue: 'Total yields were distributed to investors.',
}

const OndoContracts: any = {
  [CHAIN.ETHEREUM]: {
    OUSG: '0x1B19C19393e2d034D8Ff31ff34c81252FcBbee92',
    OUSGOracle: '0x0502c5ae08E7CD64fe1AEDA7D6e229413eCC6abe',
    USDY: '0x96F6eF951840721AdBF46Ac996b59E0235CB985C',
    USDYc: '0xe86845788d6e3E5C2393ADe1a051AE617D974C09',
    USDYOracle: '0xA0219AA5B31e65Bc920B5b6DFb8EdF0988121De0',
  },
  [CHAIN.SOLANA]: {
    OUSG: 'i7u4r16TcsJTgq1kAG8opmVZyVnAKBwLKu6ZPMwzxNc',
    USDY: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6',
  },
  [CHAIN.POLYGON]: {
    OUSG: '0xbA11C5effA33c4D6F8f593CFA394241CfE925811',
  },
  [CHAIN.MANTLE]: {
    USDY: '0x5bE26527e817998A7206475496fDE1E68957c5A6',
  },
  [CHAIN.APTOS]: {
    USDY: '0xcfea864b32833f157f042618bd845145256b1bf4c0da34a7013b76e42daa53cc::usdy::USDY',
  },
  [CHAIN.ARBITRUM]: {
    USDY: '0x35e050d3C0eC2d29D269a8EcEa763a183bDF9A9D',
  },
  [CHAIN.SUI]: {
    // USDY_TREASURY_CAP_OBJECT_ID
    USDY: '0x9dca9f57a78fa7f132f95a0cf5c4d1b796836145ead7337da6b94012db62267a',
  },
  [CHAIN.NOBLE]: {
    USDY: 'ausdy',
  },
}

const OndoAbis = {
  totalSupply: 'uint256:totalSupply',
  getPriceData: 'function getPriceData() view returns (uint256 price, uint256 timestamp)',
}

// use the same rates fetched on Ethereum for all chains
async function getPrices(timestamp: number): Promise<{
  OUSG: number;
  USDY: number;
}> {
  const blockNumber = await sdk.blocks.getBlockNumber(CHAIN.ETHEREUM, timestamp)

  const [ousgPriceData, usdyPriceData] = await sdk.api2.abi.multiCall({
    chain: CHAIN.ETHEREUM,
    abi: OndoAbis.getPriceData,
    calls: [
      OndoContracts[CHAIN.ETHEREUM].OUSGOracle,
      OndoContracts[CHAIN.ETHEREUM].USDYOracle,
    ],
    block: blockNumber,
  })

  return {
    OUSG: Number(ousgPriceData.price) / 1e18,
    USDY: Number(usdyPriceData.price) / 1e18,
  }
}

async function getSupply(useChainApi: sdk.ChainApi): Promise<{
  OUSG: number;
  USDY: number;
}> {
  if (useChainApi.chain === CHAIN.SOLANA) {
    const [supplyOUSG, supplyUSDY] = await Promise.all([
      solana.getTokenSupply(OndoContracts[CHAIN.SOLANA].OUSG),
      solana.getTokenSupply(OndoContracts[CHAIN.SOLANA].USDY),
    ])

    return {
      OUSG: Number(supplyOUSG),
      USDY: Number(supplyUSDY),
    }
  } else if (useChainApi.chain === CHAIN.APTOS) {
    const { supply, decimals } = await getCoinSupply(OndoContracts[CHAIN.APTOS].USDY)
    return {
      OUSG: 0,
      USDY: supply / Math.pow(10, decimals),
    }
  } else if (useChainApi.chain === CHAIN.SUI) {
    const treasuryCapInfo = await getObject(OndoContracts[CHAIN.SUI].USDY)
    return {
      OUSG: 0,
      USDY: Number(treasuryCapInfo.fields.total_supply.fields.value) / 1e6,
    }
  } else if (useChainApi.chain === CHAIN.NOBLE) {
    // haven't make sure that this is standard for all coins on noble yet
    // will make it in nobel helper once we reuse this call somewhere
    const res = await axios.get(`https://rest.cosmos.directory/noble/cosmos/bank/v1beta1/supply/by_denom?denom=${OndoContracts[CHAIN.NOBLE].USDY}`);
    return {
      OUSG: 0,
      USDY: Number(parseInt(res.data.amount.amount)) / 1e18,
    }
  } else {
    const [supplyOUSG, supplyUSDY, supplyUSDYc] = await useChainApi.multiCall({
      abi: OndoAbis.totalSupply,
      calls: [
        OndoContracts[useChainApi.chain].OUSG,
        OndoContracts[useChainApi.chain].USDY,
        OndoContracts[useChainApi.chain].USDYc,
      ],
      permitFailure: true,
    })

    return {
      OUSG: Number(supplyOUSG ? supplyOUSG : 0) / 1e18,
      USDY: (Number(supplyUSDY ? supplyUSDY : 0) + Number(supplyUSDYc ? supplyUSDYc : 0)) / 1e18,
    }
  }
}

const fetch: any = async (options: FetchOptions) => {
  // USD value
  const dailyFees = options.createBalances()

  const oldPrices = await getPrices(options.fromTimestamp)
  const newPrices = await getPrices(options.toTimestamp)

  const supply = await getSupply(options.api)

  dailyFees.addUSDValue(supply.OUSG * (newPrices.OUSG - oldPrices.OUSG))
  dailyFees.addUSDValue(supply.USDY * (newPrices.USDY - oldPrices.USDY))

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  runAtCurrTime: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-04-26',
    },
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2023-06-03',
    },
    [CHAIN.MANTLE]: {
      fetch,
      start: '2023-10-25',
    },
    [CHAIN.APTOS]: {
      fetch: fetch,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2024-08-08',
    },
    [CHAIN.SUI]: {
      fetch: fetch,
    },
    [CHAIN.NOBLE]: {
      fetch: fetch,
    },
  },
}

export default adapter
