import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Dex } from "../target/types/dex";
import { Launcher } from "../target/types/launcher";
import { Keypair } from "@solana/web3.js";
import { DexUtils } from "./utils";
import { expect } from "chai";
import { LauncherUtils } from "./utils/launcher.utils";

describe("dex.admin.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const signer = anchor.Wallet.local().payer;
  const dexProgram = anchor.workspace.Dex as Program<Dex>;
  const launcherProgram = anchor.workspace.Launcher as Program<Launcher>;
  const confirmOptions = {
    skipPreflight: true,
  };
  const dexUtils = new DexUtils(dexProgram, confirmOptions);
  const launcherUtils = new LauncherUtils(launcherProgram, confirmOptions);
  const [cpiAuthority] = launcherUtils.pdaGetter.getAuthorityAddress();

  it("Should update admin", async () => {
    await dexUtils.initializeAuthorityManager(signer, cpiAuthority);
    await dexUtils.updateAuthorityManagerAdmin(signer, signer.publicKey);
  });

  it("Should update swap fee", async () => {
    await dexUtils.initializeAuthorityManager(signer, cpiAuthority);
    let dexConfig = await dexUtils.initializeConfig(signer);

    let newSwapFeeRate = new BN(12_000);
    await dexUtils.updateSwapFeeRate(signer, newSwapFeeRate);

    let actual = (await dexUtils.getConfigState(dexConfig)).swapFeeRate;
    expect(actual.toNumber(), "Swap fee rate mismatch!").equal(
      newSwapFeeRate.toNumber()
    );
  });

  it("Should update launch fee", async () => {
    await dexUtils.initializeAuthorityManager(signer, cpiAuthority);
    let dexConfig = await dexUtils.initializeConfig(signer);

    let newLaunchFeeRate = new BN(12_000);
    await dexUtils.updateLaunchFeeRate(signer, newLaunchFeeRate);

    let actual = (await dexUtils.getConfigState(dexConfig)).launchFeeRate;
    expect(actual.toNumber(), "Launch fee rate mismatch!").equal(
      newLaunchFeeRate.toNumber()
    );
  });

  it("Should update initial reserve", async () => {
    await dexUtils.initializeAuthorityManager(signer, cpiAuthority);
    let dexConfig = await dexUtils.initializeConfig(signer);

    let newInitialReserve = new BN(3 * 10 ** 9);
    await dexUtils.updateInitialReserve(signer, newInitialReserve);

    let actual = (await dexUtils.getConfigState(dexConfig)).initialReserve;
    expect(actual.toNumber(), "Initial reserve mismatch!").equal(
      newInitialReserve.toNumber()
    );
  });

  it("Should update vault reserve bound", async () => {
    await dexUtils.initializeAuthorityManager(signer, cpiAuthority);
    let dexConfig = await dexUtils.initializeConfig(signer);

    let newVaultReserveBound = new BN(205_000_001).mul(new BN(10 ** 9));
    await dexUtils.updateVaultReserveBound(signer, newVaultReserveBound);
    let actual = (await dexUtils.getConfigState(dexConfig)).vaultReserveBound;

    expect(actual.toString(), "Vault reserve bound mismatch!").to.deep.equal(
      newVaultReserveBound.toString()
    );
  });

  it("Should update cpi authority", async () => {
    let authorityManager = await dexUtils.initializeAuthorityManager(
      signer,
      cpiAuthority
    );
    await dexUtils.initializeConfig(signer);

    let newCpiAuthority = new Keypair().publicKey;
    await dexUtils.updateAuthorityManagerCpiAuthority(signer, newCpiAuthority);
    let actual = (await dexUtils.getAuthorityManagerState(authorityManager))
      .cpiAuthority;

    expect(actual.toString(), "Cpi authority mismatch!").to.deep.equal(
      newCpiAuthority.toString()
    );

    await dexUtils.updateAuthorityManagerCpiAuthority(signer, cpiAuthority);
  });
});
