export const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toFixed(2)}`;

export const timeOf = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

export const dateTimeOf = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

export const channelLabel = (c: string) =>
  ({ pos: "Checkout (POS)", esl: "Shelf Label (ESL)", ecommerce: "Ecommerce" }[c] ?? c);

export const channelShort = (c: string) =>
  ({ pos: "POS", esl: "ESL", ecommerce: "Ecom" }[c] ?? c);
