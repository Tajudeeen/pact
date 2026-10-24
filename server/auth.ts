import { randomBytes, createHash } from "node:crypto";
import { createSiweMessage } from "viem/siwe";
import { verifyMessage, getAddress, type Address, type Hex } from "viem";
import type { Store } from "./store";
import { Fault } from "./service";
const hash = (x: string) => createHash("sha256").update(x).digest("hex");
export class Auth {
  constructor(
    readonly store: Store,
    readonly origin: string,
    readonly now = () => Date.now(),
  ) {}
  session(owner: string, mode: "replay" | "testnet") {
    const token = randomBytes(32).toString("hex");
    this.store.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(hash(token), owner, mode, this.now() + 86400000);
    return token;
  }
  read(token: string | undefined) {
    if (!token) return undefined;
    return this.store.db
      .prepare("SELECT owner,mode FROM sessions WHERE token=? AND expires>?")
      .get(hash(token), this.now()) as
      { owner: string; mode: "replay" | "testnet" } | undefined;
  }
  revoke(token: string) {
    this.store.db
      .prepare("DELETE FROM sessions WHERE token=?")
      .run(hash(token));
  }
  challenge(address: string) {
    const owner = getAddress(address),
      id = randomBytes(16).toString("hex");
    const message = createSiweMessage({
      address: owner,
      chainId: 50383,
      domain: new URL(this.origin).host,
      uri: this.origin,
      version: "1",
      nonce: id,
      issuedAt: new Date(this.now()),
      expirationTime: new Date(this.now() + 300000),
      statement:
        "Sign in to Pact. This signature grants no trading or withdrawal permission.",
    });
    this.store.db
      .prepare("INSERT INTO challenges VALUES(?,?,?,?)")
      .run(id, owner.toLowerCase(), message, this.now() + 300000);
    return { id, message };
  }
  async verify(id: string, signature: Hex) {
    const row = this.store.db
      .prepare("SELECT * FROM challenges WHERE id=? AND expires>?")
      .get(id, this.now()) as { address: string; message: string } | undefined;
    if (!row)
      throw new Fault(
        "AUTH_EXPIRED",
        "Signing request expired. Start again.",
        401,
      );
    const valid = await verifyMessage({
      address: row.address as Address,
      message: row.message,
      signature,
    });
    if (!valid)
      throw new Fault("BAD_SIGNATURE", "Wallet signature did not match.", 401);
    const removed = this.store.db
      .prepare("DELETE FROM challenges WHERE id=?")
      .run(id);
    if (!removed.changes)
      throw new Fault("AUTH_USED", "Signing request already used.", 401);
    return { owner: row.address, token: this.session(row.address, "testnet") };
  }
}
