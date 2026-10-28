// Exact TypeScript port of Deepstate's TickMath32 settlement math.
// Source: https://github.com/Deepstate-Protocol/deepstate-contracts/blob/master/src/libraries/TickMath32.sol
const FACTOR0 = [
  0x100000000000000000000000000000000n,
  0xffffff4e8de845adac77243cd0914b37n,
  0xfffffe9d1bd1065a50971275792f1c83n,
  0xfffffdeba9ba4205ec0a898fcd6f94e9n,
  0xfffffd3a37a3f8b07e7c4871dc00d76en,
  0xfffffc88c58e2a5a07970e01eea908e4n,
  0xfffffbd75378d702870599268a464fcfn,
  0xfffffb25e163fea9fc72a8c66eced432n,
  0xfffffa746f4fa1506788fbc89750bf71n,
  0xfffff9c2fd3bbef5c7f3511439f23c11n,
  0xfffff9118b28579a1d5c6790c7f175abn,
  0xfffff86019156b3d676efe25eda498b3n,
  0xfffff7aea702f9dfa5d5d3bb9279d256n,
  0xfffff6fd34f10380d83ba739d8f75046n,
  0xfffff64bc2df8820fe4b37891ebb409fn,
  0xfffff59a50ce87c017af4391fc7bd1b4n,
] as const;

const FACTOR1 = [
  0n,
  0xfffff4e8debe025e24128a3d460731f1n,
  0xffffe9d1bdf703aef21ea4dcfb0682d8n,
  0xffffdeba9dab03ed16130032411d9852n,
  0xffffd3a37dda03133bde87a8379c8932n,
  0xffffc88c5e84011c0f7061c1f8747ebbn,
  0xffffbd753fa8fe023cb7f01a95a85617n,
  0xffffb25e2148f9c06fa4cf6516bd41can,
  0xffffa7470363f4515426d76c762b6b61n,
  0xffff9c2fe5f9edaf962e1b139ece9519n,
  0xffff9118c90ae5d5e1aae8556956bbcen,
  0xffff8601ac96dcbee28dc84499b8b8ddn,
  0xffff7aea909dd26544c77f0bdc9ee440n,
  0xffff6fd3751fc6c3b4490bedc4d9b6afn,
  0xffff64bc5a1cb9d4dd03a944c8d06bfbn,
  0xffff59a53f94ab936ae8cc833ff1a560n,
] as const;

const FACTOR2 = [
  0n,
  0xffff4e8e25879bfa09ea263360240c1an,
  0xfffe9d1cc60ddab126de1aec4a87e7b8n,
  0xfffdebabe19266e494faa08bf06f95d2n,
  0xfffd3a3b7814eb53cd7629d70fea116an,
  0xfffc88cb899512be849eb1004af9a6dan,
  0xfffbd75c161287e4a9d98eb29b205e4en,
  0xfffb25ed1d8cf58667a3511be150639fn,
  0xfffa747ea0040664238f92f792405805n,
  0xfff9c3109d77653e7e48d2997f2379d1n,
  0xfff911a315e6bcd6539048f8bac58ea3n,
  0xfff860360951b7ecba3dc0ba9b0a7c4dn,
  0xfff7aec977b80143043f6d3dd6d17ccan,
  0xfff6fd5d6119439abe99c1a5c03bd998n,
  0xfff64bf1c57529b5b16747e59b571accn,
  0xfff59a86a4cb5e55dfd877cc112a9619n,
] as const;

const FACTOR3 = [
  0n,
  0xfff4e91bff1b8c3d88338e0ebf284a4dn,
  0xffe9d2b2f7db2755ddf1d28a378a438cn,
  0xffdebcc4e4eb184180b1fe46ef229c17n,
  0xffd3a751c0f7e10bd3b9f8ae012fbe06n,
  0xffc8925986ae3ed08f06593fe67ac1bfn,
  0xffbd7ddc30bb29b9304ec1b3093eeb72n,
  0xffb269d9b9cbd4fa6c269773746a69d9n,
  0xffa756521c8daed19f3a1b48fb94c589n,
  0xff9c434553ae60823fa7dde946a88ebfn,
  0xff9130b359dbce534e76903b39de605fn,
  0xff861e9c29c4178cc9272e1140473f0bn,
  0xff7b0cffbe1596751b6382200cc3b5d9n,
  0xff6ffbde117ee04e90c901f772e3d464n,
  0xff64eb371eaec554c6d000c306ca5e48n,
  0xff59db0ae05450ba1ecf379840cb103dn,
] as const;

const FACTOR4 = [
  0n,
  0xff4ecb59511ec8a5301ba217ef18dd7cn,
  0xfe9e115c7b8f884badd25995e79d2f09n,
  0xfdedd1b496a89f34c46757b38a53619an,
  0xfd3e0c0cf486c174853f3a5931e0ee03n,
  0xfc8ec01121e447bb455d621825da76cdn,
  0xfbdfed6ce5f09c489da5ff395ecae2e6n,
  0xfb3193cc4227c3f46f66a72687c5c9a8n,
  0xfa83b2db722a033a7c25bb14315d7fccn,
  0xf9d64a46eb939f352d2e093e4110a050n,
  0xf92959bb5dd4ba7434b7e1b1c86a6355n,
  0xf87ce0e5b2094d9bbff35cfc575603f6n,
  0xf7d0df730ad13bb8fe90d496d60fb6ean,
  0xf7255510c4288238d1b490ead1a26390n,
  0xf67a416c733f846d81897dca4e77a30en,
  0xf5cfa433e653729065e4527c9e33781cn,
] as const;

const FACTOR5 = [
  0n,
  0xf5257d152486cc2c7b9d0c7aed980fc3n,
  0xeac0c6e7dd24392ed02d75b3706e54fan,
  0xe0ccdeec2a94e111065895048dd333c8n,
  0xd744fccad69d6af439a68bb9902d3fden,
  0xce248c151f8480e3e235838f95f2c6ecn,
  0xc5672a115506dadd3e2ad0c964dd9f36n,
  0xbd08a39f580c36bea8811fb66d0faf78n,
  0xb504f333f9de6484597d89b3754abe9fn,
  0xad583eea42a14ac64980a8c8f59a2ec4n,
  0xa5fed6a9b15138ea1cbd7f621710701an,
  0x9ef5326091a111ada0911f09ebb9fdcfn,
  0x9837f0518db8a96f46ad23182e42f6f6n,
  0x91c3d373ab11c3360fd6d8e0ae5ac9d6n,
  0x8b95c1e3ea8bd6e6fbe4628758a53c8fn,
  0x85aac367cc487b14c5c95b8c2154c1b0n,
] as const;

const RESIDUAL_FACTOR = [
  0n,
  0xffffffd3a37a05e383e14c90273c94f5n,
  0xffffffa746f41376f74124cd483186d4n,
  0xffffff7aea6e28ba5a1e33b2f9234215n,
] as const;

const UINT256_MAX = (1n << 256n) - 1n;

function fractionFactor(input: bigint) {
  const residual = Number(input & 3n);
  let fraction = input >> 2n;
  let factor = FACTOR0[Number(fraction & 15n)];
  const tables = [FACTOR1, FACTOR2, FACTOR3, FACTOR4, FACTOR5];

  for (let index = 0; index < tables.length; index++) {
    const nibble = Number((fraction >> BigInt(4 * (index + 1))) & 15n);
    if (nibble !== 0) factor = (factor * tables[index][nibble]) >> 128n;
  }
  if (residual !== 0) factor = (factor * RESIDUAL_FACTOR[residual]) >> 128n;
  return factor;
}

function priceFactorAtTick(tick: number) {
  const scaledTick = BigInt(tick) * 3n;
  let integerExponent = scaledTick >> 26n;
  const fraction = scaledTick - (integerExponent << 26n);
  let factor: bigint;

  if (fraction <= 0x2000000n) {
    factor = UINT256_MAX / fractionFactor(fraction) + 1n;
  } else {
    integerExponent += 1n;
    factor = fractionFactor(0x4000000n - fraction);
  }
  return { factor, shift: 128n - integerExponent };
}

export function quoteAtTick(tick: number, quantity: bigint, roundUp: boolean) {
  if (quantity === 0n) return 0n;
  if (tick === 0) return quantity;
  const { factor, shift } = priceFactorAtTick(tick);
  const product = quantity * factor;
  const quotient = product >> shift;
  const remainder = product & ((1n << shift) - 1n);
  return roundUp && remainder !== 0n ? quotient + 1n : quotient;
}
