import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Dex } from "../target/types/dex";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DexUtils, TokenUtils, nextIndex, sleep } from "./utils";
import { expect } from "chai";

describe("dex.admin.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const signer = anchor.Wallet.local().payer;
  const dexProgram = anchor.workspace.Dex as Program<Dex>;
  const confirmOptions = {
    skipPreflight: true,
  };
  const dexUtils = new DexUtils(dexProgram, confirmOptions);
  const tokenUtils = new TokenUtils(
    anchor.getProvider().connection,
    confirmOptions
  );

  it("Refund auth", async () => {
    let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
      signer,
      100_000_000,
      100_000_000
    );

    await dexUtils.initializeDexProtocol(signer);

    let dexConfigArgs = {
      index: nextIndex(),
      admin: signer.publicKey,
    };

    let dexConfig = await dexUtils.initializeDexConfig(signer, dexConfigArgs);

    let dexArgs = {
      config: dexConfig,
      initAmount0: new BN(2000),
      initAmount1: new BN(4555),
      reserveBound: new BN(3000),
      openTime: new BN(0),
      mint0,
      mint1,
      signerAta0: ata0,
      signerAta1: ata1,
      swapFeeRate: new BN(0),
      launchFeeRate: new BN(0),
    };

    let dexAccounts = await dexUtils.initializeDex(signer, dexArgs);
    await sleep(1000);

    let balance = await anchor
      .getProvider()
      .connection.getBalance(dexAccounts.auth);

    await dexUtils.fundDexAuth(signer, dexAccounts.auth, LAMPORTS_PER_SOL);
    await sleep(1000);

    let actual = await anchor
      .getProvider()
      .connection.getBalance(dexAccounts.auth);

    expect(actual, "Balance mismatch!").equal(balance + LAMPORTS_PER_SOL);
  });

  it("Update admin", async () => {
    let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
      signer,
      100_000_000,
      100_000_000
    );

    await dexUtils.initializeDexProtocol(signer);

    let dexConfigArgs = {
      index: nextIndex(),
      admin: signer.publicKey,
    };

    let dexConfig = await dexUtils.initializeDexConfig(signer, dexConfigArgs);

    let dexArgs = {
      config: dexConfig,
      initAmount0: new BN(2000),
      initAmount1: new BN(4555),
      reserveBound: new BN(3000),
      openTime: new BN(0),
      mint0,
      mint1,
      signerAta0: ata0,
      signerAta1: ata1,
      swapFeeRate: new BN(0),
      launchFeeRate: new BN(0),
    };

    let dexAccounts = await dexUtils.initializeDex(signer, dexArgs);
    await sleep(1000);

    let new_admin = Keypair.generate().publicKey;
    await dexUtils.updateDexAdmin(signer, dexAccounts.config, new_admin);
    await sleep(1000);

    let actual = (await dexUtils.getConfigState(dexAccounts.config)).admin;
    expect(actual.toString(), "Admin mismatch!").equal(new_admin.toString());
  });

  it("Update dex creation", async () => {
    let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
      signer,
      100_000_000,
      100_000_000
    );

    await dexUtils.initializeDexProtocol(signer);

    let dexConfigArgs = {
      index: nextIndex(),
      admin: signer.publicKey,
    };

    let dexConfig = await dexUtils.initializeDexConfig(signer, dexConfigArgs);

    let dexArgs = {
      config: dexConfig,
      initAmount0: new BN(2000),
      initAmount1: new BN(4555),
      reserveBound: new BN(3000),
      openTime: new BN(0),
      mint0,
      mint1,
      signerAta0: ata0,
      signerAta1: ata1,
      swapFeeRate: new BN(0),
      launchFeeRate: new BN(0),
    };

    let dexAccounts = await dexUtils.initializeDex(signer, dexArgs);
    await sleep(1000);

    await dexUtils.updateConfigCreateDex(signer, dexAccounts.config, false);
    await sleep(1000);

    let actual = (await dexUtils.getConfigState(dexAccounts.config))
      .disableCreateDex;
    expect(actual, "Balance mismatch!").equal(false);
  });

  it("Update swap fee", async () => {
    let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
      signer,
      100_000_000,
      100_000_000
    );

    await dexUtils.initializeDexProtocol(signer);

    let dexConfigArgs = {
      index: nextIndex(),
      admin: signer.publicKey,
    };

    let dexConfig = await dexUtils.initializeDexConfig(signer, dexConfigArgs);

    let dexArgs = {
      config: dexConfig,
      initAmount0: new BN(2000),
      initAmount1: new BN(4555),
      reserveBound: new BN(3000),
      openTime: new BN(0),
      mint0,
      mint1,
      signerAta0: ata0,
      signerAta1: ata1,
      swapFeeRate: new BN(1),
      launchFeeRate: new BN(0),
    };

    let dexAccounts = await dexUtils.initializeDex(signer, dexArgs);
    await sleep(1000);

    let newFeeRate = new BN(10_000);
    await dexUtils.updateDexSwapFeeRate(
      signer,
      dexAccounts.config,
      dexAccounts.state,
      newFeeRate
    );
    await sleep(1000);

    let actual = (await dexUtils.getDexState(dexAccounts.state)).swapFeeRate;
    expect(actual.toNumber(), "Swap fee rate mismatch!").equal(
      newFeeRate.toNumber()
    );
  });

  it("Update launch fee", async () => {
    let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
      signer,
      100_000_000,
      100_000_000
    );

    await dexUtils.initializeDexProtocol(signer);

    let dexConfigArgs = {
      index: nextIndex(),
      admin: signer.publicKey,
    };

    let dexConfig = await dexUtils.initializeDexConfig(signer, dexConfigArgs);

    let dexArgs = {
      config: dexConfig,
      initAmount0: new BN(2000),
      initAmount1: new BN(4555),
      reserveBound: new BN(3000),
      openTime: new BN(0),
      mint0,
      mint1,
      signerAta0: ata0,
      signerAta1: ata1,
      swapFeeRate: new BN(1),
      launchFeeRate: new BN(1),
    };

    let dexAccounts = await dexUtils.initializeDex(signer, dexArgs);
    await sleep(1000);

    let newLaunchRate = new BN(10_000);
    await dexUtils.updateDexLaunchFeeRate(
      signer,
      dexAccounts.config,
      dexAccounts.state,
      newLaunchRate
    );
    await sleep(1000);

    let actual = (await dexUtils.getDexState(dexAccounts.state)).launchFeeRate;
    expect(actual.toNumber(), "Launch fee rate mismatch!").equal(
      newLaunchRate.toNumber()
    );
  });
});
