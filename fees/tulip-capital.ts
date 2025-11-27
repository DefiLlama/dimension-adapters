import { CuratorConfig, getCuratorExport } from "../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0x59e608E4842162480591032f3c8b0aE55C98d104',
      ],
      eulerVaultOwners: [
        '0x7c615e12D1163fc0DdDAA01B51922587034F5C93',
      ],
      lagoon: [
        "0x936facdf10c8c36294e7b9d28345255539d81bc7", // RockSolid rock.rETH
        "0xb09f761cb13baca8ec087ac476647361b6314f98", // Flagship cbBTC
      ],
    },
    berachain: {
      eulerVaultOwners: [
        '0x18d23B961b11079EcD499c0EAD8E4F347e4d3A66',
      ],
    },
    bob: {
      eulerVaultOwners: [
        '0x7c615e12D1163fc0DdDAA01B51922587034F5C93',
      ],
    },
    bsc: {
      eulerVaultOwners: [
        '0x7c615e12D1163fc0DdDAA01B51922587034F5C93',
      ],
    },
    avax: {
      lagoon: [
        "0x3048925b3ea5a8c12eecccb8810f5f7544db54af", // Turtle Avalanche USDC
        "0xb893c8d7000e0408eb7d168152ec7fefdd0d25e3", // Turtle Avalanche BTC.b
      ],
    },
    tac: {
      lagoon:[
        '0x279385c180f5d01c4a4bdff040f17b8957304762' // Noon USN TAC
      ]
    }
  }
}

export default getCuratorExport(curatorConfig)
