export type AllowanceRequestKind = "credit" | "debit";

export function getSignedAllowanceRequestAmount(amount: number, kind: AllowanceRequestKind) {
  return kind === "debit" ? amount * -1 : amount;
}

export function getAllowanceRequestKindLabel(kind: AllowanceRequestKind) {
  return kind === "debit" ? "Debit" : "Credit";
}
