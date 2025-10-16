import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { CuratorConfig, getCuratorExport } from "../../helpers/curators";

const curatorConfig: CuratorConfig = {
  vaults: {
    [CHAIN.HYPERLIQUID]:{
      morpho: [
        '0x5e105266db42f78FA814322Bce7f388B4C2e61eb',
        '0xD66d69c288d9a6FD735d7bE8b2e389970fC4fD42',
        '0x057ced81348D57Aad579A672d521d7b4396E8a61',
        '0x81e064d0eB539de7c3170EDF38C1A42CBd752A76',
        '0x96C6cBB6251Ee1c257b2162ca0f39AA5Fa44B1FB',
        '0x441794D6a8F9A3739F5D4E98a728937b33489D29',
        '0xc061d38903b99aC12713B550C2CB44B221674F94',
        '0x6EB6724D8D3D4FF9E24d872E8c38403169dC05f8',
      ],
    },
  }
}

export default getCuratorExport(curatorConfig)
