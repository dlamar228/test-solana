import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Launcher } from "../target/types/launcher";
import { Faucet } from "../target/types/faucet";
import { Keypair } from "@solana/web3.js";
import { FaucetUtils } from "./utils";
import { expect } from "chai";
import { LauncherUtils } from "./utils/launcher.utils";

describe("launcher.admin.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const signer = anchor.Wallet.local().payer;
  const launcherProgram = anchor.workspace.Launcher as Program<Launcher>;
  const faucetProgram = anchor.workspace.Faucet as Program<Faucet>;
  const confirmOptions = {
    skipPreflight: true,
  };
  const faucetUtils = new FaucetUtils(faucetProgram, confirmOptions);
  const launcherUtils = new LauncherUtils(launcherProgram, confirmOptions);
  const [faucetAuthority] = faucetUtils.pdaGetter.getAuthorityAddress();

  it("Should update admin", async () => {
    await launcherUtils.initializeAuthorityManager(signer, faucetAuthority);
    await launcherUtils.updateAuthorityManagerAdmin(signer, signer.publicKey);
  });

  it("Should update config team tokens", async () => {
    await launcherUtils.initializeAuthorityManager(signer, faucetAuthority);
    let launcherConfig = await launcherUtils.initializeConfig(signer);

    let newTeamTokens = new BN(50_000_001).mul(new BN(10 ** 9));
    await launcherUtils.updateConfigTeamTokens(signer, newTeamTokens);
    let actual = (await launcherUtils.getConfigState(launcherConfig))
      .teamTokens;
    expect(actual.toString(), "Team tokens mismatch!").equal(
      newTeamTokens.toString()
    );
  });

  it("Should update config faucet tokens", async () => {
    await launcherUtils.initializeAuthorityManager(signer, faucetAuthority);
    let launcherConfig = await launcherUtils.initializeConfig(signer);

    let newFaucetTokens = new BN(50_000_001).mul(new BN(10 ** 9));
    await launcherUtils.updateConfigFaucetTokens(signer, newFaucetTokens);
    let actual = (await launcherUtils.getConfigState(launcherConfig))
      .faucetTokens;
    expect(actual.toString(), "Faucet tokens mismatch!").equal(
      newFaucetTokens.toString()
    );
  });

  it("Should update faucet authority", async () => {
    let authorityManager = await launcherUtils.initializeAuthorityManager(
      signer,
      faucetAuthority
    );
    let newFaucetAuthority = new Keypair().publicKey;
    await launcherUtils.updateAuthorityManagerFaucetAuthority(
      signer,
      newFaucetAuthority
    );

    let actual = (
      await launcherUtils.getAuthorityManagerState(authorityManager)
    ).faucetAuthority;

    expect(actual.toString(), "Faucet authority mismatch!").to.deep.equal(
      newFaucetAuthority.toString()
    );

    await launcherUtils.updateAuthorityManagerFaucetAuthority(
      signer,
      faucetAuthority
    );
  });
});
