import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Dex } from "../target/types/dex";
import {
  Commitment,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
} from "@solana/web3.js";
import {
  DexUtils,
  TokenUtils,
  createRaydiumProgram,
  RaydiumUtils,
  ammConfigAddress,
  sleep,
  SwapCalculator,
  DexAccounts,
  SwapBaseResult,
  TokenVault,
  nextIndex,
  MintPair,
  SwapBaseInputArgs,
  DexCreationArgs,
  SwapBaseOutputArgs,
} from "./utils";
import { expect } from "chai";

describe("dex.swap.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const signer = anchor.Wallet.local().payer;
  const dexProgram = anchor.workspace.Dex as Program<Dex>;
  const raydiumProgram = createRaydiumProgram(anchor.getProvider());
  const confirmOptions = {
    skipPreflight: true,
    commitment: "confirmed" as Commitment,
  };
  const dexUtils = new DexUtils(dexProgram, confirmOptions);
  const raydiumUtils = new RaydiumUtils(raydiumProgram, confirmOptions);
  const tokenUtils = new TokenUtils(
    anchor.getProvider().connection,
    confirmOptions
  );
  const swapCalculator = new SwapCalculator();

  // describe("Spl token", () => {
  //   it("TEST LAUNCH", async () => {
  //     let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
  //       signer,
  //       100_000_000,
  //       100_000_000
  //     );

  //     let dexConfigArgs = {
  //       index: nextIndex(),
  //     };
  //     let dexConfig = await dexUtils.initializeConfig(signer, dexConfigArgs);

  //     let dexArgs = {
  //       config: dexConfig,
  //       initAmount0: new BN(2000),
  //       initAmount1: new BN(4555),
  //       reserveBound: new BN(2100),
  //       openTime: new BN(0),
  //       mint0,
  //       mint1,
  //       signerAta0: ata0,
  //       signerAta1: ata1,
  //       protocolFeeRate: new BN(0),
  //       launchFeeRate: new BN(0),
  //     };
  //     let dexAccounts = await dexUtils.initializeDex(signer, dexArgs);

  //     let fundTx = await dexUtils.fundDexAuth(
  //       signer,
  //       dexAccounts.auth,
  //       LAMPORTS_PER_SOL
  //     );

  //     await sleep(1000);

  //     let expected = await dexUtils.isLaunched(dexAccounts.state);
  //     expect(true, "Dex already launched!").not.equal(expected);

  //     let swapArgs = {
  //       inputToken: dexAccounts.vault0.mint.address,
  //       inputTokenProgram: dexAccounts.vault0.mint.program,
  //       outputToken: dexAccounts.vault1.mint.address,
  //       outputTokenProgram: dexAccounts.vault1.mint.program,
  //       inputAta: ata0,
  //       outputAta: ata1,
  //       inputVault: dexAccounts.vault0.address,
  //       outputVault: dexAccounts.vault1.address,
  //       amountIn: new BN(1000),
  //       minimumAmountOut: new BN(100),
  //       dexAccounts,
  //     };
  //     let swapTx = await dexUtils.swapBaseInput(signer, swapArgs);

  //     let actual = await dexUtils.isReadyToLaunch(dexAccounts.state);
  //     expect(actual, "Dex not ready to launch!").equal(true);

  //     let launchArgs = {
  //       cpSwapProgram: raydiumUtils.program.programId,
  //       raydiumAmmConfig: ammConfigAddress,
  //       raydiumPdaGetter: raydiumUtils.pdaGetter,
  //       dexAccounts,
  //     };
  //     let launchTx = await dexUtils.launchDex(signer, launchArgs);

  //     let refundTx = await dexUtils.refundDexAuth(
  //       signer,
  //       dexAccounts.state,
  //       dexAccounts.auth,
  //       dexAccounts.config
  //     );
  //   });
  // });

  describe("Spl token", () => {
    it("Should swap base input", async () => {
      let mints = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );

      let swapTest = await setupInputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseInput(
        signer,
        swapTest.swapBaseInputArgs
      );
    });

    it("Should swap base input and prepared to launch", async () => {
      let mints = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupInputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseInput(
        signer,
        swapTest.swapBaseInputArgs
      );

      let actual = await dexUtils.isReadyToLaunch(swapTest.dexAccounts.state);
      expect(actual, "Dex not ready to launch!").equal(true);
    });

    it("Should swap base input with fee", async () => {
      let mints = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupInputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseInput(
        signer,
        swapTest.swapBaseInputArgs
      );

      let actualSwapFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).swapFeesToken0.toNumber();

      expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
        swapTest.swapInputExpected.swapResult.protocolFee.toNumber()
      );
    });

    it("Should swap base input with fee and launch", async () => {
      let mints = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupInputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );
      let expectedLaunchFee = swapCalculator.curve.Fee(
        swapTest.swapBaseInputArgs.amountIn
          .add(swapTest.dexCreationArgs.initAmount0)
          .sub(swapTest.swapInputExpected.swapResult.protocolFee),
        swapTest.dexCreationArgs.launchFeeRate
      );

      let swapTx = await dexUtils.swapBaseInput(
        signer,
        swapTest.swapBaseInputArgs
      );

      let actualSwapFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).swapFeesToken0;

      expect(actualSwapFee.toNumber(), "Swap fee calculation mismatch!").equal(
        swapTest.swapInputExpected.swapResult.protocolFee.toNumber()
      );
      expect(
        await dexUtils.isReadyToLaunch(swapTest.dexAccounts.state),
        "Dex not ready to launch!"
      ).equal(true);

      let launchDexArgs = {
        cpSwapProgram: raydiumProgram.programId,
        raydiumAmmConfig: ammConfigAddress,
        raydiumPdaGetter: raydiumUtils.pdaGetter,
        dexAccounts: swapTest.dexAccounts,
      };

      let launchTx = dexUtils.launchDex(signer, launchDexArgs);
      await sleep(1000);

      let actualLaunchFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).launchFeesToken0;

      expect(
        actualLaunchFee.toNumber(),
        "Launch fee calculation mismatch!"
      ).equal(expectedLaunchFee.toNumber());
    });

    it("Should swap base output", async () => {
      let mints = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );

      let swapTest = await setupOutputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseOutput(
        signer,
        swapTest.swapBaseOutputArgs
      );
    });

    it("Should swap base output with fee", async () => {
      let mints = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupOutputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseOutput(
        signer,
        swapTest.swapBaseOutputArgs
      );

      let actualSwapFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).swapFeesToken0.toNumber();

      expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
        swapTest.swapOutputExpected.swapResult.protocolFee.toNumber()
      );
    });

    it("Should swap base output and prepared to launch", async () => {
      let mints = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupOutputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseOutput(
        signer,
        swapTest.swapBaseOutputArgs
      );

      let actual = await dexUtils.isReadyToLaunch(swapTest.dexAccounts.state);
      expect(actual, "Dex not ready to launch!").equal(true);
    });

    it("Should swap base output with fee and launch", async () => {
      let mints = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupOutputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let expectedLaunchFee = swapCalculator.curve.Fee(
        swapTest.swapOutputExpected.swapResult.sourceAmountSwapped
          .add(swapTest.dexCreationArgs.initAmount0)
          .sub(swapTest.swapOutputExpected.swapResult.protocolFee),
        swapTest.dexCreationArgs.launchFeeRate
      );

      let swapTx = await dexUtils.swapBaseOutput(
        signer,
        swapTest.swapBaseOutputArgs
      );

      let actualSwapFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).swapFeesToken0;

      expect(actualSwapFee.toNumber(), "Swap fee calculation mismatch!").equal(
        swapTest.swapOutputExpected.swapResult.protocolFee.toNumber()
      );
      expect(
        await dexUtils.isReadyToLaunch(swapTest.dexAccounts.state),
        "Dex not ready to launch!"
      ).equal(true);

      let launchDexArgs = {
        cpSwapProgram: raydiumProgram.programId,
        raydiumAmmConfig: ammConfigAddress,
        raydiumPdaGetter: raydiumUtils.pdaGetter,
        dexAccounts: swapTest.dexAccounts,
      };

      let launchTx = dexUtils.launchDex(signer, launchDexArgs);
      await sleep(1000);

      let actualLaunchFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).launchFeesToken0;

      expect(
        actualLaunchFee.toNumber(),
        "Launch fee calculation mismatch!"
      ).equal(expectedLaunchFee.toNumber());
    });
  });

  describe("Token 2022", () => {
    it("Should swap base input", async () => {
      let mints = await tokenUtils.initialize2022MintPair(
        signer,
        100_000_000_000,
        100_000_000_000
      );

      let swapTest = await setupInputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseInput(
        signer,
        swapTest.swapBaseInputArgs
      );
    });

    it("Should swap base input and prepared to launch", async () => {
      let mints = await tokenUtils.initialize2022MintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupInputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseInput(
        signer,
        swapTest.swapBaseInputArgs
      );

      let actual = await dexUtils.isReadyToLaunch(swapTest.dexAccounts.state);
      expect(actual, "Dex not ready to launch!").equal(true);
    });

    it("Should swap base input with fee", async () => {
      let mints = await tokenUtils.initialize2022MintPair(
        signer,
        100_000_000,
        100_000_000
      );

      let swapTest = await setupInputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseInput(
        signer,
        swapTest.swapBaseInputArgs
      );

      let actualSwapFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).swapFeesToken0.toNumber();

      expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
        swapTest.swapInputExpected.swapResult.protocolFee.toNumber()
      );
    });

    it("Should swap base input with fee and launch", async () => {
      let mints = await tokenUtils.initialize2022MintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupInputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );
      let expectedLaunchFee = swapCalculator.curve.Fee(
        swapTest.swapBaseInputArgs.amountIn
          .add(swapTest.dexCreationArgs.initAmount0)
          .sub(swapTest.swapInputExpected.swapResult.protocolFee),
        swapTest.dexCreationArgs.launchFeeRate
      );

      let swapTx = await dexUtils.swapBaseInput(
        signer,
        swapTest.swapBaseInputArgs
      );

      let actualSwapFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).swapFeesToken0;

      expect(actualSwapFee.toNumber(), "Swap fee calculation mismatch!").equal(
        swapTest.swapInputExpected.swapResult.protocolFee.toNumber()
      );
      expect(
        await dexUtils.isReadyToLaunch(swapTest.dexAccounts.state),
        "Dex not ready to launch!"
      ).equal(true);

      let launchDexArgs = {
        cpSwapProgram: raydiumProgram.programId,
        raydiumAmmConfig: ammConfigAddress,
        raydiumPdaGetter: raydiumUtils.pdaGetter,
        dexAccounts: swapTest.dexAccounts,
      };

      let launchTx = dexUtils.launchDex(signer, launchDexArgs);
      await sleep(1000);

      let actualLaunchFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).launchFeesToken0;

      expect(
        actualLaunchFee.toNumber(),
        "Launch fee calculation mismatch!"
      ).equal(expectedLaunchFee.toNumber());
    });

    it("Should swap base output", async () => {
      let mints = await tokenUtils.initialize2022MintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupOutputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseOutput(
        signer,
        swapTest.swapBaseOutputArgs
      );
    });

    it("Should swap base output with fee", async () => {
      let mints = await tokenUtils.initialize2022MintPair(
        signer,
        100_000_000,
        100_000_000
      );

      let swapTest = await setupOutputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseOutput(
        signer,
        swapTest.swapBaseOutputArgs
      );

      let actualSwapFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).swapFeesToken0.toNumber();

      expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
        swapTest.swapOutputExpected.swapResult.protocolFee.toNumber()
      );
    });

    it("Should swap base output and prepared to launch", async () => {
      let mints = await tokenUtils.initialize2022MintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupOutputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let swapTx = await dexUtils.swapBaseOutput(
        signer,
        swapTest.swapBaseOutputArgs
      );

      let actual = await dexUtils.isReadyToLaunch(swapTest.dexAccounts.state);
      expect(actual, "Dex not ready to launch!").equal(true);
    });

    it("Should swap base output with fee and launch", async () => {
      let mints = await tokenUtils.initialize2022MintPair(
        signer,
        100_000_000,
        100_000_000
      );
      let swapTest = await setupOutputSwapTest(
        signer,
        mints,
        tokenUtils,
        dexUtils
      );

      let expectedLaunchFee = swapCalculator.curve.Fee(
        swapTest.swapOutputExpected.swapResult.sourceAmountSwapped
          .add(swapTest.dexCreationArgs.initAmount0)
          .sub(swapTest.swapOutputExpected.swapResult.protocolFee),
        swapTest.dexCreationArgs.launchFeeRate
      );

      let swapTx = await dexUtils.swapBaseOutput(
        signer,
        swapTest.swapBaseOutputArgs
      );

      let actualSwapFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).swapFeesToken0;

      expect(actualSwapFee.toNumber(), "Swap fee calculation mismatch!").equal(
        swapTest.swapOutputExpected.swapResult.protocolFee.toNumber()
      );
      expect(
        await dexUtils.isReadyToLaunch(swapTest.dexAccounts.state),
        "Dex not ready to launch!"
      ).equal(true);

      let launchDexArgs = {
        cpSwapProgram: raydiumProgram.programId,
        raydiumAmmConfig: ammConfigAddress,
        raydiumPdaGetter: raydiumUtils.pdaGetter,
        dexAccounts: swapTest.dexAccounts,
      };

      let launchTx = dexUtils.launchDex(signer, launchDexArgs);
      await sleep(1000);

      let actualLaunchFee = (
        await dexUtils.getDexState(swapTest.dexAccounts.state)
      ).launchFeesToken0;

      expect(
        actualLaunchFee.toNumber(),
        "Launch fee calculation mismatch!"
      ).equal(expectedLaunchFee.toNumber());
    });
  });
});

async function setupSwapBaseInputTest(
  dexUtils: DexUtils,
  dexAccounts: DexAccounts,
  tokenUtils: TokenUtils,
  calculator: SwapCalculator,
  inputVault: TokenVault,
  outputVault: TokenVault,
  amountIn: BN,
  minimumAmountOut: BN
): Promise<SwapBaseResult> {
  let [
    dexState,
    inputVaultBalance,
    outputVaultBalance,
    inputMintConfig,
    outputMintConfig,
    epoch,
  ] = await Promise.all([
    dexUtils.getDexState(dexAccounts.state),
    tokenUtils.getBalance(inputVault.address),
    tokenUtils.getBalance(outputVault.address),
    tokenUtils.getTransferFeeConfig(
      inputVault.mint.address,
      inputVault.mint.program
    ),
    tokenUtils.getTransferFeeConfig(
      outputVault.mint.address,
      outputVault.mint.program
    ),
    tokenUtils.getEpoch(),
  ]);

  let result = calculator.swapBaseInput({
    protocolFeeRate: dexState.swapFeeRate,
    inputProtocolFee: dexState.swapFeesToken0,
    outputProtocolFee: dexState.swapFeesToken1,
    inputMintConfig,
    outputMintConfig,
    inputVault: inputVaultBalance,
    outputVault: outputVaultBalance,
    amountIn,
    minimumAmountOut,
    epoch: BigInt(epoch),
  });

  return result;
}

async function setupSwapOutputTest(
  dexUtils: DexUtils,
  dexAccounts: DexAccounts,
  tokenUtils: TokenUtils,
  calculator: SwapCalculator,
  inputVault: TokenVault,
  outputVault: TokenVault,
  maxAmountIn: BN,
  amountOutLessFee: BN
): Promise<SwapBaseResult> {
  let [
    dexState,
    inputVaultBalance,
    outputVaultBalance,
    inputMintConfig,
    outputMintConfig,
    epoch,
  ] = await Promise.all([
    dexUtils.getDexState(dexAccounts.state),
    tokenUtils.getBalance(inputVault.address),
    tokenUtils.getBalance(outputVault.address),
    tokenUtils.getTransferFeeConfig(
      inputVault.mint.address,
      inputVault.mint.program
    ),
    tokenUtils.getTransferFeeConfig(
      outputVault.mint.address,
      outputVault.mint.program
    ),
    tokenUtils.getEpoch(),
  ]);

  let result = calculator.swapBaseOutput({
    protocolFeeRate: dexState.swapFeeRate,
    inputProtocolFee: dexState.swapFeesToken0,
    outputProtocolFee: dexState.swapFeesToken1,
    inputMintConfig,
    outputMintConfig,
    inputVault: inputVaultBalance,
    outputVault: outputVaultBalance,
    maxAmountIn,
    amountOutLessFee,
    epoch: BigInt(epoch),
  });

  // console.log(
  //   "destinationAmountSwapped: ",
  //   result.swapResult.destinationAmountSwapped.toString()
  // );
  // console.log(
  //   "newSwapDestinationAmount: ",
  //   result.swapResult.newSwapDestinationAmount.toString()
  // );
  // console.log(
  //   "newSwapSourceAmount: ",
  //   result.swapResult.newSwapSourceAmount.toString()
  // );
  // console.log(
  //   "sourceAmountSwapped: ",
  //   result.swapResult.sourceAmountSwapped.toString()
  // );
  // console.log("protocolFee: ", result.swapResult.protocolFee.toString());

  return result;
}

interface SetupInputSwap {
  mints: MintPair;
  dexCreationArgs: DexCreationArgs;
  dexAccounts: DexAccounts;
  swapBaseInputArgs: SwapBaseInputArgs;
  swapInputExpected: SwapBaseResult;
}

async function setupInputSwapTest(
  signer: Signer,
  mints: MintPair,
  tokenUtils: TokenUtils,
  dexUtils: DexUtils,
  amountIn: BN = new BN(1000),
  minimumAmountOut: BN = new BN(100),
  initAmount0: BN = new BN(2000),
  initAmount1: BN = new BN(5000),
  reserveBound: BN = new BN(2500),
  protocolFeeRate: BN = new BN(25_000),
  launchFeeRate: BN = new BN(10_000)
): Promise<SetupInputSwap> {
  let dexConfigArgs = {
    index: nextIndex(),
  };
  let dexConfig = await dexUtils.initializeConfig(signer, dexConfigArgs);

  let dexCreationArgs = {
    config: dexConfig,
    initAmount0,
    initAmount1,
    reserveBound,
    openTime: new BN(0),
    mint0: mints.mint0,
    mint1: mints.mint1,
    signerAta0: mints.ata0,
    signerAta1: mints.ata1,
    protocolFeeRate,
    launchFeeRate,
  };
  let dexAccounts = await dexUtils.initializeDex(signer, dexCreationArgs);

  let fundTx = await dexUtils.fundDexAuth(
    signer,
    dexAccounts.auth,
    LAMPORTS_PER_SOL
  );

  await sleep(1000);

  let swapBaseInputArgs = {
    inputToken: dexAccounts.vault0.mint.address,
    inputTokenProgram: dexAccounts.vault0.mint.program,
    outputToken: dexAccounts.vault1.mint.address,
    outputTokenProgram: dexAccounts.vault1.mint.program,
    inputAta: mints.ata0,
    outputAta: mints.ata1,
    inputVault: dexAccounts.vault0.address,
    outputVault: dexAccounts.vault1.address,
    amountIn,
    minimumAmountOut,
    dexAccounts: dexAccounts,
  };

  let swapInputExpected = await setupSwapBaseInputTest(
    dexUtils,
    dexAccounts,
    tokenUtils,
    new SwapCalculator(),
    dexAccounts.vault0,
    dexAccounts.vault1,
    swapBaseInputArgs.amountIn,
    swapBaseInputArgs.minimumAmountOut
  );

  return {
    mints,
    dexAccounts,
    swapBaseInputArgs,
    swapInputExpected,
    dexCreationArgs,
  };
}

interface SetupOutputSwap {
  mints: MintPair;
  dexCreationArgs: DexCreationArgs;
  dexAccounts: DexAccounts;
  swapBaseOutputArgs: SwapBaseOutputArgs;
  swapOutputExpected: SwapBaseResult;
}

async function setupOutputSwapTest(
  signer: Signer,
  mints: MintPair,
  tokenUtils: TokenUtils,
  dexUtils: DexUtils,
  maxAmountIn: BN = new BN(1000),
  amountOutLessFee: BN = new BN(1250),
  initAmount0: BN = new BN(2000),
  initAmount1: BN = new BN(5000),
  reserveBound: BN = new BN(2500),
  protocolFeeRate: BN = new BN(25_000),
  launchFeeRate: BN = new BN(10_000)
): Promise<SetupOutputSwap> {
  let dexConfigArgs = {
    index: nextIndex(),
  };
  let dexConfig = await dexUtils.initializeConfig(signer, dexConfigArgs);

  let dexCreationArgs = {
    config: dexConfig,
    initAmount0,
    initAmount1,
    reserveBound,
    openTime: new BN(0),
    mint0: mints.mint0,
    mint1: mints.mint1,
    signerAta0: mints.ata0,
    signerAta1: mints.ata1,
    protocolFeeRate,
    launchFeeRate,
  };
  let dexAccounts = await dexUtils.initializeDex(signer, dexCreationArgs);

  let fundTx = await dexUtils.fundDexAuth(
    signer,
    dexAccounts.auth,
    LAMPORTS_PER_SOL
  );

  await sleep(1000);

  let swapBaseOutputArgs = {
    inputToken: dexAccounts.vault0.mint.address,
    inputTokenProgram: dexAccounts.vault0.mint.program,
    outputToken: dexAccounts.vault1.mint.address,
    outputTokenProgram: dexAccounts.vault1.mint.program,
    inputAta: mints.ata0,
    outputAta: mints.ata1,
    inputVault: dexAccounts.vault0.address,
    outputVault: dexAccounts.vault1.address,
    maxAmountIn,
    amountOutLessFee,
    dexAccounts,
  };

  let swapOutputExpected = await setupSwapOutputTest(
    dexUtils,
    dexAccounts,
    tokenUtils,
    new SwapCalculator(),
    dexAccounts.vault0,
    dexAccounts.vault1,
    swapBaseOutputArgs.maxAmountIn,
    swapBaseOutputArgs.amountOutLessFee
  );

  return {
    mints,
    dexAccounts,
    swapBaseOutputArgs,
    swapOutputExpected,
    dexCreationArgs,
  };
}
