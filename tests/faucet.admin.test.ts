import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Faucet } from "../target/types/faucet";
import { FaucetUtils } from "./utils";
import { expect } from "chai";
import { PublicKey } from "@metaplex-foundation/js";

describe("faucet.admin.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const signer = anchor.Wallet.local().payer;
  const faucetProgram = anchor.workspace.Faucet as Program<Faucet>;
  const confirmOptions = {
    skipPreflight: true,
  };
  const faucetUtils = new FaucetUtils(faucetProgram, confirmOptions);

  it("Should add admin", async () => {
    let authorityManager = await faucetUtils.initializeAuthorityManager(signer);
    let index = 1;
    await faucetUtils.AddAdmin(signer, new BN(index), signer.publicKey);
    let actual = (await faucetUtils.geAuthorityManager(authorityManager))
      .admins;

    expect(actual[1].toString(), "Admin mismatch!").equal(
      signer.publicKey.toString()
    );
  });

  it("Should remove admin", async () => {
    let authorityManager = await faucetUtils.initializeAuthorityManager(signer);
    let index = 1;
    await faucetUtils.removeAdmin(signer, new BN(index));
    let actual = (await faucetUtils.geAuthorityManager(authorityManager))
      .admins;

    expect(actual[1].toString(), "Admin mismatch!").equal(
      PublicKey.default.toString()
    );
  });
});
