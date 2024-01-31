import postgres from "postgres";

export const createInstance = (connectionString: string) =>
  postgres(connectionString, {
    transform: {
      undefined: null,
    },
    types: {
      bytea: {
        to: 17,
        from: [17],
        serialize: (x: any) => "\\x" + Buffer.from(x).toString("hex"),
        parse: (x: any) => Buffer.from(x.slice(2), "hex"),
      },
    },
  });

export const indexa = createInstance(process.env.INDEXA_DB!);

export const toBytea = (address: string | Buffer) => {
  if (typeof address === "string") {
    return indexa.typed.bytea(Buffer.from(address.slice(2), "hex"));
  } else {
    return indexa.typed.bytea(address);
  }
};
