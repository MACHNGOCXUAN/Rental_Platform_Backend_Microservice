import crypto from "crypto";

export function generateHash(data: any) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
}