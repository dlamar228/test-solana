import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Dex } from "../target/types/dex";
import {
  DexUtils,
  TokenUtils,
  createRaydiumProgram,
  RaydiumUtils,
  ammConfigAddress,
  nextIndex,
} from "./utils";

describe("dex.initialize.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const signer = anchor.Wallet.local().payer;
  const dexProgram = anchor.workspace.Dex as Program<Dex>;
  const raydiumProgram = createRaydiumProgram(anchor.getProvider());

  const confirmOptions = {
    skipPreflight: true,
  };
  const dexUtils = new DexUtils(dexProgram, confirmOptions);
  const raydiumUtils = new RaydiumUtils(raydiumProgram, confirmOptions);
  const tokenUtils = new TokenUtils(
    anchor.getProvider().connection,
    confirmOptions
  );

  it("initialize with spl mints", async () => {
    let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
      signer,
      100_000_000,
      100_000_000
    );

    let raydiumPoolArgs = {
      amm: ammConfigAddress,
      initAmount0: new BN(2000),
      initAmount1: new BN(4555),
      openTime: new BN(0),
      mint0,
      mint1,
      signerAta0: ata0,
      signerAta1: ata1,
    };
    let raydiumAccounts = await raydiumUtils.initializePool(
      signer,
      raydiumPoolArgs
    );

    let dexConfigArgs = {
      index: nextIndex(),
    };

    let dexConfig = await dexUtils.initializeConfig(signer, dexConfigArgs);

    let dexArgs = {
      config: dexConfig,
      initAmount0: new BN(2000),
      initAmount1: new BN(4555),
      reserveBound: new BN(3000),
      openTime: new BN(0),
      raydium: raydiumAccounts.state,
      mint0,
      mint1,
      signerAta0: ata0,
      signerAta1: ata1,
      protocolFeeRate: new BN(0),
      launchFeeRate: new BN(0),
    };

    await dexUtils.initializeDex(signer, dexArgs);
  });

  it("initialize with token 2022 mints", async () => {
    let { mint0, mint1, ata0, ata1 } = await tokenUtils.initialize2022MintPair(
      signer,
      100_000_000,
      100_000_000
    );

    let raydiumPoolArgs = {
      amm: ammConfigAddress,
      initAmount0: new BN(2000),
      initAmount1: new BN(4555),
      openTime: new BN(0),
      mint0,
      mint1,
      signerAta0: ata0,
      signerAta1: ata1,
    };
    let raydiumAccounts = await raydiumUtils.initializePool(
      signer,
      raydiumPoolArgs
    );

    let dexConfigArgs = {
      index: nextIndex(),
    };

    let dexConfig = await dexUtils.initializeConfig(signer, dexConfigArgs);

    let dexArgs = {
      config: dexConfig,
      initAmount0: new BN(2000),
      initAmount1: new BN(4555),
      reserveBound: new BN(3000),
      openTime: new BN(0),
      raydium: raydiumAccounts.state,
      mint0,
      mint1,
      signerAta0: ata0,
      signerAta1: ata1,
      protocolFeeRate: new BN(0),
      launchFeeRate: new BN(0),
    };

    await dexUtils.initializeDex(signer, dexArgs);
  });
});
