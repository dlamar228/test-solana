import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Dex } from "../target/types/dex";
import { PublicKey } from "@solana/web3.js";
import {
  DexUtils,
  TokenUtils,
  createRaydiumProgram,
  RaydiumUtils,
  ammConfigAddress,
  sleep,
  SwapCalculator,
  DexAccounts,
  SwapBaseInputResult,
  TokenVault,
} from "./utils";
import { expect } from "chai";

describe("dex.swap.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  var index = 0;
  const nextIndex = () => {
    index += 1;
    return index;
  };
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
  const swapCalculator = new SwapCalculator();

  describe("Spl token", () => {
    it("Should swap base input", async () => {
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

      let dexAmmArgs = {
        index: nextIndex(),
        protocolFeeRate: new BN(0),
        launchFeeRate: new BN(0),
      };
      let dexAmm = await dexUtils.initializeAmm(signer, dexAmmArgs);

      let dexArgs = {
        amm: dexAmm,
        initAmount0: new BN(2000),
        initAmount1: new BN(4555),
        reserveBound: new BN(5000),
        openTime: new BN(0),
        raydium: raydiumAccounts.state,
        mint0,
        mint1,
        signerAta0: ata0,
        signerAta1: ata1,
      };
      let dexAccounts = await dexUtils.initialize(signer, dexArgs);

      await sleep(1000);

      let swapArgs = {
        inputToken: dexAccounts.vault0.mint.address,
        inputTokenProgram: dexAccounts.vault0.mint.program,
        outputToken: dexAccounts.vault1.mint.address,
        outputTokenProgram: dexAccounts.vault1.mint.program,
        inputAta: ata0,
        outputAta: ata1,
        inputVault: dexAccounts.vault0.address,
        outputVault: dexAccounts.vault1.address,
        amountIn: new BN(1000),
        minimumAmountOut: new BN(100),
        raydiumAccounts,
        dexAccounts,
      };
      let swapTx = await dexUtils.swapBaseInput(signer, swapArgs);
    });

    it("Should swap base input and launch", async () => {
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

      let dexAmmArgs = {
        index: nextIndex(),
        protocolFeeRate: new BN(0),
        launchFeeRate: new BN(0),
      };
      let dexAmm = await dexUtils.initializeAmm(signer, dexAmmArgs);

      let dexArgs = {
        amm: dexAmm,
        initAmount0: new BN(2000),
        initAmount1: new BN(4555),
        reserveBound: new BN(2100),
        openTime: new BN(0),
        raydium: raydiumAccounts.state,
        mint0,
        mint1,
        signerAta0: ata0,
        signerAta1: ata1,
      };
      let dexAccounts = await dexUtils.initialize(signer, dexArgs);

      await sleep(1000);

      let expected = await dexUtils.isLaunched(dexAccounts.state);
      expect(true, "Dex already launched!").not.equal(expected);

      let swapArgs = {
        inputToken: dexAccounts.vault0.mint.address,
        inputTokenProgram: dexAccounts.vault0.mint.program,
        outputToken: dexAccounts.vault1.mint.address,
        outputTokenProgram: dexAccounts.vault1.mint.program,
        inputAta: ata0,
        outputAta: ata1,
        inputVault: dexAccounts.vault0.address,
        outputVault: dexAccounts.vault1.address,
        amountIn: new BN(1000),
        minimumAmountOut: new BN(100),
        raydiumAccounts,
        dexAccounts,
      };
      let swapTx = await dexUtils.swapBaseInput(signer, swapArgs);

      let actual = await dexUtils.isLaunched(dexAccounts.state);
      expect(actual, "Dex not launched!").equal(true);
    });

    it("Should swap base input with fee", async () => {
      let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );

      let raydiumPoolArgs = {
        amm: ammConfigAddress,
        initAmount0: new BN(2000),
        initAmount1: new BN(4000),
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

      let dexAmmArgs = {
        index: nextIndex(),
        protocolFeeRate: new BN(30_000),
        launchFeeRate: new BN(0),
      };
      let dexAmm = await dexUtils.initializeAmm(signer, dexAmmArgs);

      let dexArgs = {
        amm: dexAmm,
        initAmount0: new BN(2000),
        initAmount1: new BN(4000),
        reserveBound: new BN(5000),
        openTime: new BN(0),
        raydium: raydiumAccounts.state,
        mint0,
        mint1,
        signerAta0: ata0,
        signerAta1: ata1,
      };
      let dexAccounts = await dexUtils.initialize(signer, dexArgs);

      await sleep(1000);

      let swapArgs = {
        inputToken: dexAccounts.vault0.mint.address,
        inputTokenProgram: dexAccounts.vault0.mint.program,
        outputToken: dexAccounts.vault1.mint.address,
        outputTokenProgram: dexAccounts.vault1.mint.program,
        inputAta: ata0,
        outputAta: ata1,
        inputVault: dexAccounts.vault0.address,
        outputVault: dexAccounts.vault1.address,
        amountIn: new BN(1000),
        minimumAmountOut: new BN(100),
        raydiumAccounts,
        dexAccounts,
      };

      let swapInputExpected = await setupSwapBaseInputTest(
        dexUtils,
        dexAccounts,
        tokenUtils,
        swapCalculator,
        dexAccounts.vault0,
        dexAccounts.vault1,
        swapArgs.amountIn,
        swapArgs.minimumAmountOut
      );

      let swapTx = await dexUtils.swapBaseInput(signer, swapArgs);

      let actualSwapFee = (
        await dexUtils.getDexState(dexAccounts.state)
      ).protocolFeesToken0.toNumber();

      expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
        swapInputExpected.swapResult.protocolFee.toNumber()
      );
    });

    it("Should swap base input with fee and launch", async () => {
      let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );

      let raydiumPoolArgs = {
        amm: ammConfigAddress,
        initAmount0: new BN(2000),
        initAmount1: new BN(4000),
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

      let dexAmmArgs = {
        index: nextIndex(),
        protocolFeeRate: new BN(30_000),
        launchFeeRate: new BN(10_000),
      };
      let dexAmm = await dexUtils.initializeAmm(signer, dexAmmArgs);

      let dexArgs = {
        amm: dexAmm,
        initAmount0: new BN(2000),
        initAmount1: new BN(4000),
        reserveBound: new BN(2001),
        openTime: new BN(0),
        raydium: raydiumAccounts.state,
        mint0,
        mint1,
        signerAta0: ata0,
        signerAta1: ata1,
      };
      let dexAccounts = await dexUtils.initialize(signer, dexArgs);

      await sleep(1000);

      let swapArgs = {
        inputToken: dexAccounts.vault0.mint.address,
        inputTokenProgram: dexAccounts.vault0.mint.program,
        outputToken: dexAccounts.vault1.mint.address,
        outputTokenProgram: dexAccounts.vault1.mint.program,
        inputAta: ata0,
        outputAta: ata1,
        inputVault: dexAccounts.vault0.address,
        outputVault: dexAccounts.vault1.address,
        amountIn: new BN(1000),
        minimumAmountOut: new BN(100),
        raydiumAccounts,
        dexAccounts,
      };

      let swapInputExpected = await setupSwapBaseInputTest(
        dexUtils,
        dexAccounts,
        tokenUtils,
        swapCalculator,
        dexAccounts.vault0,
        dexAccounts.vault1,
        swapArgs.amountIn,
        swapArgs.minimumAmountOut
      );

      let expectedLaunchFee = swapCalculator.curve.protocolFee(
        swapArgs.amountIn
          .add(dexArgs.initAmount0)
          .sub(swapInputExpected.swapResult.protocolFee),
        dexAmmArgs.launchFeeRate
      );

      let swapTx = await dexUtils.swapBaseInput(signer, swapArgs);
      let actualSwapFee = (await dexUtils.getDexState(dexAccounts.state))
        .protocolFeesToken0;

      let actualLaunchFee = (
        await tokenUtils.getBalance(swapArgs.inputVault)
      ).sub(actualSwapFee);

      expect(actualSwapFee.toNumber(), "Swap fee calculation mismatch!").equal(
        swapInputExpected.swapResult.protocolFee.toNumber()
      );
      expect(
        await dexUtils.isLaunched(dexAccounts.state),
        "Dex not launched!"
      ).equal(true);
      expect(
        actualLaunchFee.toNumber(),
        "Launch fee calculation mismatch!"
      ).equal(expectedLaunchFee.toNumber());
    });

    it("Should swap base output", async () => {
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

      let dexAmmArgs = {
        index: nextIndex(),
        protocolFeeRate: new BN(0),
        launchFeeRate: new BN(0),
      };
      let dexAmm = await dexUtils.initializeAmm(signer, dexAmmArgs);

      let dexArgs = {
        amm: dexAmm,
        initAmount0: new BN(2000),
        initAmount1: new BN(4555),
        reserveBound: new BN(5000),
        openTime: new BN(0),
        raydium: raydiumAccounts.state,
        mint0,
        mint1,
        signerAta0: ata0,
        signerAta1: ata1,
      };
      let dexAccounts = await dexUtils.initialize(signer, dexArgs);

      await sleep(1000);

      let swapArgs = {
        inputToken: dexAccounts.vault0.mint.address,
        inputTokenProgram: dexAccounts.vault0.mint.program,
        outputToken: dexAccounts.vault1.mint.address,
        outputTokenProgram: dexAccounts.vault1.mint.program,
        inputAta: ata0,
        outputAta: ata1,
        inputVault: dexAccounts.vault0.address,
        outputVault: dexAccounts.vault1.address,
        maxAmountIn: new BN(1000),
        amountOutLessFee: new BN(1250),
        raydiumAccounts,
        dexAccounts,
      };
      let swapTx = await dexUtils.swapBaseOutput(signer, swapArgs);
    });

    it("Should swap base output and launch", async () => {
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

      let dexAmmArgs = {
        index: nextIndex(),
        protocolFeeRate: new BN(0),
        launchFeeRate: new BN(0),
      };
      let dexAmm = await dexUtils.initializeAmm(signer, dexAmmArgs);

      let dexArgs = {
        amm: dexAmm,
        initAmount0: new BN(2000),
        initAmount1: new BN(4555),
        reserveBound: new BN(2100),
        openTime: new BN(0),
        raydium: raydiumAccounts.state,
        mint0,
        mint1,
        signerAta0: ata0,
        signerAta1: ata1,
      };
      let dexAccounts = await dexUtils.initialize(signer, dexArgs);

      await sleep(1000);

      let expected = await dexUtils.isLaunched(dexAccounts.state);
      expect(true, "Dex already launched!").not.equal(expected);

      let swapArgs = {
        inputToken: dexAccounts.vault0.mint.address,
        inputTokenProgram: dexAccounts.vault0.mint.program,
        outputToken: dexAccounts.vault1.mint.address,
        outputTokenProgram: dexAccounts.vault1.mint.program,
        inputAta: ata0,
        outputAta: ata1,
        inputVault: dexAccounts.vault0.address,
        outputVault: dexAccounts.vault1.address,
        maxAmountIn: new BN(1000),
        amountOutLessFee: new BN(1250),
        raydiumAccounts,
        dexAccounts,
      };
      let swapTx = await dexUtils.swapBaseOutput(signer, swapArgs);

      let actual = await dexUtils.isLaunched(dexAccounts.state);
      expect(actual, "Dex not launched!").equal(true);
    });

    it("Should swap base output with fee ", async () => {
      let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );

      let raydiumPoolArgs = {
        amm: ammConfigAddress,
        initAmount0: new BN(2000),
        initAmount1: new BN(5000),
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

      let dexAmmArgs = {
        index: nextIndex(),
        protocolFeeRate: new BN(30_000),
        launchFeeRate: new BN(30_000),
      };
      let dexAmm = await dexUtils.initializeAmm(signer, dexAmmArgs);

      let dexArgs = {
        amm: dexAmm,
        initAmount0: new BN(2000),
        initAmount1: new BN(5000),
        reserveBound: new BN(5000),
        openTime: new BN(0),
        raydium: raydiumAccounts.state,
        mint0,
        mint1,
        signerAta0: ata0,
        signerAta1: ata1,
      };
      let dexAccounts = await dexUtils.initialize(signer, dexArgs);

      await sleep(1000);

      let swapArgs = {
        inputToken: dexAccounts.vault0.mint.address,
        inputTokenProgram: dexAccounts.vault0.mint.program,
        outputToken: dexAccounts.vault1.mint.address,
        outputTokenProgram: dexAccounts.vault1.mint.program,
        inputAta: ata0,
        outputAta: ata1,
        inputVault: dexAccounts.vault0.address,
        outputVault: dexAccounts.vault1.address,
        maxAmountIn: new BN(1000),
        amountOutLessFee: new BN(200),
        raydiumAccounts,
        dexAccounts,
      };

      let swapOutputExpected = await setupSwapOutputInputTest(
        dexUtils,
        dexAccounts,
        tokenUtils,
        swapCalculator,
        dexAccounts.vault0,
        dexAccounts.vault1,
        swapArgs.maxAmountIn,
        swapArgs.amountOutLessFee
      );

      let swapTx = await dexUtils.swapBaseOutput(signer, swapArgs);

      let actualSwapFee = (
        await dexUtils.getDexState(dexAccounts.state)
      ).protocolFeesToken0.toNumber();
      expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
        swapOutputExpected.swapResult.protocolFee.toNumber()
      );
    });

    it("Should swap base output with fee and launch", async () => {
      let { mint0, mint1, ata0, ata1 } = await tokenUtils.initializeSplMintPair(
        signer,
        100_000_000,
        100_000_000
      );

      let raydiumPoolArgs = {
        amm: ammConfigAddress,
        initAmount0: new BN(2000),
        initAmount1: new BN(5000),
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

      let dexAmmArgs = {
        index: nextIndex(),
        protocolFeeRate: new BN(25_000),
        launchFeeRate: new BN(20_000),
      };
      let dexAmm = await dexUtils.initializeAmm(signer, dexAmmArgs);

      let dexArgs = {
        amm: dexAmm,
        initAmount0: new BN(4000),
        initAmount1: new BN(5000),
        reserveBound: new BN(4005),
        openTime: new BN(0),
        raydium: raydiumAccounts.state,
        mint0,
        mint1,
        signerAta0: ata0,
        signerAta1: ata1,
      };
      let dexAccounts = await dexUtils.initialize(signer, dexArgs);

      await sleep(1000);

      let swapArgs = {
        inputToken: dexAccounts.vault0.mint.address,
        inputTokenProgram: dexAccounts.vault0.mint.program,
        outputToken: dexAccounts.vault1.mint.address,
        outputTokenProgram: dexAccounts.vault1.mint.program,
        inputAta: ata0,
        outputAta: ata1,
        inputVault: dexAccounts.vault0.address,
        outputVault: dexAccounts.vault1.address,
        maxAmountIn: new BN(1000),
        amountOutLessFee: new BN(200),
        raydiumAccounts,
        dexAccounts,
      };

      let swapOutputExpected = await setupSwapOutputInputTest(
        dexUtils,
        dexAccounts,
        tokenUtils,
        swapCalculator,
        dexAccounts.vault0,
        dexAccounts.vault1,
        swapArgs.maxAmountIn,
        swapArgs.amountOutLessFee
      );

      let expectedLaunchFee = swapCalculator.curve.protocolFee(
        swapOutputExpected.swapResult.sourceAmountSwapped
          .add(dexArgs.initAmount0)
          .sub(swapOutputExpected.swapResult.protocolFee),
        dexAmmArgs.launchFeeRate
      );

      let swapTx = await dexUtils.swapBaseOutput(signer, swapArgs);

      let actualSwapFee = (await dexUtils.getDexState(dexAccounts.state))
        .protocolFeesToken0;

      let actualLaunchFee = (
        await tokenUtils.getBalance(swapArgs.inputVault)
      ).sub(actualSwapFee);

      expect(actualSwapFee.toNumber(), "Swap fee calculation mismatch!").equal(
        swapOutputExpected.swapResult.protocolFee.toNumber()
      );
      expect(
        await dexUtils.isLaunched(dexAccounts.state),
        "Dex not launched!"
      ).equal(true);
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
): Promise<SwapBaseInputResult> {
  let [
    dexState,
    ammState,
    inputVaultBalance,
    outputVaultBalance,
    inputMintConfig,
    outputMintConfig,
    epoch,
  ] = await Promise.all([
    dexUtils.getDexState(dexAccounts.state),
    dexUtils.getAmmState(dexAccounts.amm),
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
    protocolFeeRate: ammState.protocolFeeRate,
    inputProtocolFee: dexState.protocolFeesToken0,
    outputProtocolFee: dexState.protocolFeesToken1,
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

async function setupSwapOutputInputTest(
  dexUtils: DexUtils,
  dexAccounts: DexAccounts,
  tokenUtils: TokenUtils,
  calculator: SwapCalculator,
  inputVault: TokenVault,
  outputVault: TokenVault,
  maxAmountIn: BN,
  amountOutLessFee: BN
): Promise<SwapBaseInputResult> {
  let [
    dexState,
    ammState,
    inputVaultBalance,
    outputVaultBalance,
    inputMintConfig,
    outputMintConfig,
    epoch,
  ] = await Promise.all([
    dexUtils.getDexState(dexAccounts.state),
    dexUtils.getAmmState(dexAccounts.amm),
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
    protocolFeeRate: ammState.protocolFeeRate,
    inputProtocolFee: dexState.protocolFeesToken0,
    outputProtocolFee: dexState.protocolFeesToken1,
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
