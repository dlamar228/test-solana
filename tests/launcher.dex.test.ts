import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Launcher } from "../target/types/launcher";
import { Dex } from "../target/types/dex";
import { Faucet } from "../target/types/faucet";
import { DexUtils, FaucetUtils, TokenUtils } from "./utils";
import { LauncherUtils } from "./utils/launcher.utils";

describe("launcher.dex.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const signer = anchor.Wallet.local().payer;
  const launcherProgram = anchor.workspace.Launcher as Program<Launcher>;
  const faucetProgram = anchor.workspace.Faucet as Program<Faucet>;
  const dexProgram = anchor.workspace.Dex as Program<Dex>;
  const confirmOptions = {
    skipPreflight: true,
  };
  const tokenUtils = new TokenUtils(
    anchor.getProvider().connection,
    confirmOptions
  );
  const faucetUtils = new FaucetUtils(faucetProgram, confirmOptions);
  const launcherUtils = new LauncherUtils(launcherProgram, confirmOptions);
  const dexUtils = new DexUtils(dexProgram, confirmOptions);
  const [faucetAuthority] = faucetUtils.pdaGetter.getAuthorityAddress();
  const [cpiAuthority] = launcherUtils.pdaGetter.getAuthorityAddress();

  it("Should initialize launcher and dex", async () => {
    let tokenVault = await tokenUtils.initializeSplMint(
      signer,
      100_000_000_000
    );

    await launcherUtils.initializeAuthorityManager(signer, faucetAuthority);
    await launcherUtils.initializeConfig(signer);

    await faucetUtils.initializeAuthorityManager(signer);

    await dexUtils.initializeAuthorityManager(signer, cpiAuthority);
    await dexUtils.initializeConfig(signer);

    let dex_mint = await launcherUtils.createMint(
      signer,
      "TEST",
      "TST",
      "https://www.google.com"
    );

    let launcherInitializeDexArgs = {
      dexUtils,
      faucetUtils,
      payerVault: tokenVault,
      mintAuthority: dex_mint,
      hasFaucet: false,
    };
    await launcherUtils.initializeDex(signer, launcherInitializeDexArgs);
  });

  it("Should initialize launcher and dex with faucet", async () => {
    let tokenVault = await tokenUtils.initializeSplMint(
      signer,
      100_000_000_000
    );

    await launcherUtils.initializeAuthorityManager(signer, faucetAuthority);
    await launcherUtils.initializeConfig(signer);

    await faucetUtils.initializeAuthorityManager(signer);

    await dexUtils.initializeAuthorityManager(signer, cpiAuthority);
    await dexUtils.initializeConfig(signer);

    let dex_mint = await launcherUtils.createMint(
      signer,
      "TEST",
      "TST",
      "https://www.google.com"
    );

    let launcherInitializeDexArgs = {
      dexUtils,
      faucetUtils,
      payerVault: tokenVault,
      mintAuthority: dex_mint,
      hasFaucet: true,
    };
    await launcherUtils.initializeDex(signer, launcherInitializeDexArgs);
  });
});
