import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Dex } from "../target/types/dex";
import { Commitment, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  DexUtils,
  TokenUtils,
  createRaydiumProgram,
  RaydiumUtils,
  ammConfigAddress,
  sleep,
  SwapCalculator,
  SetupSwapTest,
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

  describe("Spl token", () => {
    describe("Swap, vault reserve zero, trade zero to one", () => {
      let swapInputTemplate = new SetupSwapTest(tokenUtils, dexUtils);
      let swapOutputTemplate = new SetupSwapTest(tokenUtils, dexUtils);

      it("Should swap base input", async () => {
        let mints = await tokenUtils.initializeSplMintPair(
          signer,
          100_000_000,
          100_000_000
        );

        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
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

        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
        );

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.state
        );
        expect(actual, "Dex not ready to launch!").equal(true);
      });

      it("Should swap base input with fee", async () => {
        let mints = await tokenUtils.initializeSplMintPair(
          signer,
          100_000_000,
          100_000_000
        );
        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
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

        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
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

        expect(
          actualSwapFee.toNumber(),
          "Swap fee calculation mismatch!"
        ).equal(swapTest.swapInputExpected.swapResult.protocolFee.toNumber());
        expect(
          await dexUtils.dexIsReadyToLaunch(swapTest.dexAccounts.state),
          "Dex not ready to launch!"
        ).equal(true);

        let [raydiumPool] = raydiumUtils.pdaGetter.getStateAddress(
          ammConfigAddress,
          swapTest.dexAccounts.vault0.mint.address,
          swapTest.dexAccounts.vault1.mint.address
        );

        expect(
          await raydiumUtils.getPoolState(raydiumPool),
          "Raydium pool already created!"
        ).to.be.null;

        let launchDexArgs = {
          cpSwapProgram: raydiumProgram.programId,
          raydiumAmmConfig: ammConfigAddress,
          raydiumPdaGetter: raydiumUtils.pdaGetter,
          dexAccounts: swapTest.dexAccounts,
          sharedLamports: new BN(LAMPORTS_PER_SOL),
        };

        let launchTx = await dexUtils.launchDex(signer, launchDexArgs);
        await sleep(1000);

        let actualLaunchFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.state)
        ).launchFeesToken0;

        expect(
          actualLaunchFee.toNumber(),
          "Launch fee calculation mismatch!"
        ).equal(expectedLaunchFee.toNumber());

        expect(
          await raydiumUtils.getPoolState(raydiumPool),
          "Raydium pool wasn't created!"
        ).not.to.be.null;
      });

      it("Should swap base output", async () => {
        let mints = await tokenUtils.initializeSplMintPair(
          signer,
          100_000_000,
          100_000_000
        );

        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints
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
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints
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
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints,
          new BN(2000),
          new BN(500)
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.state
        );
        expect(actual, "Dex not ready to launch!").equal(true);
      });

      it("Should swap base output with fee and launch", async () => {
        let mints = await tokenUtils.initializeSplMintPair(
          signer,
          100_000_000,
          100_000_000
        );
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints,
          new BN(2000),
          new BN(500)
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

        expect(
          actualSwapFee.toNumber(),
          "Swap fee calculation mismatch!"
        ).equal(swapTest.swapOutputExpected.swapResult.protocolFee.toNumber());
        expect(
          await dexUtils.dexIsReadyToLaunch(swapTest.dexAccounts.state),
          "Dex not ready to launch!"
        ).equal(true);

        let [raydiumPool] = raydiumUtils.pdaGetter.getStateAddress(
          ammConfigAddress,
          swapTest.dexAccounts.vault0.mint.address,
          swapTest.dexAccounts.vault1.mint.address
        );

        expect(
          await raydiumUtils.getPoolState(raydiumPool),
          "Raydium pool already created!"
        ).to.be.null;

        let launchDexArgs = {
          cpSwapProgram: raydiumProgram.programId,
          raydiumAmmConfig: ammConfigAddress,
          raydiumPdaGetter: raydiumUtils.pdaGetter,
          dexAccounts: swapTest.dexAccounts,
          sharedLamports: new BN(LAMPORTS_PER_SOL),
        };

        let launchTx = await dexUtils.launchDex(signer, launchDexArgs);
        await sleep(1000);

        let actualLaunchFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.state)
        ).launchFeesToken0;

        expect(
          actualLaunchFee.toNumber(),
          "Launch fee calculation mismatch!"
        ).equal(expectedLaunchFee.toNumber());

        expect(
          await raydiumUtils.getPoolState(raydiumPool),
          "Raydium pool wasn't created!"
        ).not.to.be.null;
      });
    });

    describe("Swap, vault reserve zero, trade one to zero", () => {
      let swapInputTemplate = new SetupSwapTest(tokenUtils, dexUtils);
      swapInputTemplate.zeroToOne = false;
      let swapOutputTemplate = new SetupSwapTest(tokenUtils, dexUtils);
      swapOutputTemplate.zeroToOne = false;

      it("Should swap base input", async () => {
        let mints = await tokenUtils.initializeSplMintPair(
          signer,
          100_000_000,
          100_000_000
        );

        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
        );

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );
      });

      it("Should swap base input and not prepared to launch", async () => {
        let mints = await tokenUtils.initializeSplMintPair(
          signer,
          100_000_000,
          100_000_000
        );
        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
        );

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.state
        );
        expect(actual, "Dex ready to launch!").equal(false);
      });

      it("Should swap base input with fee", async () => {
        let mints = await tokenUtils.initializeSplMintPair(
          signer,
          100_000_000,
          100_000_000
        );
        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
        );

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.state)
        ).swapFeesToken1.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapInputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base output", async () => {
        let mints = await tokenUtils.initializeSplMintPair(
          signer,
          100_000_000,
          100_000_000
        );

        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints
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
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints,
          new BN(2000),
          new BN(500)
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.state)
        ).swapFeesToken1.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapOutputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base output and not prepared to launch", async () => {
        let mints = await tokenUtils.initializeSplMintPair(
          signer,
          100_000_000,
          100_000_000
        );
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints,
          new BN(2000),
          new BN(500)
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.state
        );
        expect(actual, "Dex ready to launch!").equal(false);
      });
    });

    describe("Swap, vault reserve one, trade zero to one", () => {
      let swapInputTemplate = new SetupSwapTest(tokenUtils, dexUtils);
      swapInputTemplate.vaultForReserveBound = true;
      swapInputTemplate.reserveBoundGe = false;

      it("Should swap base input and prepared to launch", async () => {
        let mints = await tokenUtils.initializeSplMintPair(
          signer,
          100_000_000,
          100_000_000
        );

        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints,
          new BN(1500),
          new BN(250)
        );

        await dexUtils.swapBaseInput(signer, swapTest.swapBaseInputArgs);
        await sleep(1000);

        await dexUtils.swapBaseInput(signer, swapTest.swapBaseInputArgs);
        await sleep(1000);

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.state
        );
        expect(actual, "Dex not ready to launch!").equal(true);
      });
    });
  });

  describe("Token 2022", () => {
    describe("Swap, vault reserve zero, trade zero to one", () => {
      let swapInputTemplate = new SetupSwapTest(tokenUtils, dexUtils);
      let swapOutputTemplate = new SetupSwapTest(tokenUtils, dexUtils);

      it("Should swap base input", async () => {
        let mints = await tokenUtils.initialize2022MintPair(
          signer,
          100_000_000_000,
          100_000_000_000
        );

        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
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
        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
        );

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.state
        );
        expect(actual, "Dex not ready to launch!").equal(true);
      });

      it("Should swap base input with fee", async () => {
        let mints = await tokenUtils.initialize2022MintPair(
          signer,
          100_000_000,
          100_000_000
        );

        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
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

        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
        );

        let expectedLaunchFee = swapCalculator.curve.Fee(
          swapTest.swapBaseInputArgs.amountIn
            .add(swapTest.dexCreationArgs.initAmount0)
            .sub(swapTest.swapInputExpected.swapResult.protocolFee),
          swapTest.dexCreationArgs.launchFeeRate
        );

        let [raydiumPool] = raydiumUtils.pdaGetter.getStateAddress(
          ammConfigAddress,
          swapTest.dexAccounts.vault0.mint.address,
          swapTest.dexAccounts.vault1.mint.address
        );

        expect(
          await raydiumUtils.getPoolState(raydiumPool),
          "Raydium pool already created!"
        ).to.be.null;

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.state)
        ).swapFeesToken0;

        expect(
          actualSwapFee.toNumber(),
          "Swap fee calculation mismatch!"
        ).equal(swapTest.swapInputExpected.swapResult.protocolFee.toNumber());
        expect(
          await dexUtils.dexIsReadyToLaunch(swapTest.dexAccounts.state),
          "Dex not ready to launch!"
        ).equal(true);

        let launchDexArgs = {
          cpSwapProgram: raydiumProgram.programId,
          raydiumAmmConfig: ammConfigAddress,
          raydiumPdaGetter: raydiumUtils.pdaGetter,
          dexAccounts: swapTest.dexAccounts,
          sharedLamports: new BN(LAMPORTS_PER_SOL),
        };

        let launchTx = await dexUtils.launchDex(signer, launchDexArgs);
        await sleep(1000);

        let actualLaunchFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.state)
        ).launchFeesToken0;

        expect(
          actualLaunchFee.toNumber(),
          "Launch fee calculation mismatch!"
        ).equal(expectedLaunchFee.toNumber());

        expect(
          await raydiumUtils.getPoolState(raydiumPool),
          "Raydium pool wasn't created!"
        ).not.to.be.null;
      });

      it("Should swap base output", async () => {
        let mints = await tokenUtils.initialize2022MintPair(
          signer,
          100_000_000,
          100_000_000
        );
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints
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

        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints
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

        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints,
          new BN(2000),
          new BN(500)
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.state
        );
        expect(actual, "Dex not ready to launch!").equal(true);
      });

      it("Should swap base output with fee and launch", async () => {
        let mints = await tokenUtils.initialize2022MintPair(
          signer,
          100_000_000,
          100_000_000
        );

        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints,
          new BN(2000),
          new BN(500)
        );

        let expectedLaunchFee = swapCalculator.curve.Fee(
          swapTest.swapOutputExpected.swapResult.sourceAmountSwapped
            .add(swapTest.dexCreationArgs.initAmount0)
            .sub(swapTest.swapOutputExpected.swapResult.protocolFee),
          swapTest.dexCreationArgs.launchFeeRate
        );

        let [raydiumPool] = raydiumUtils.pdaGetter.getStateAddress(
          ammConfigAddress,
          swapTest.dexAccounts.vault0.mint.address,
          swapTest.dexAccounts.vault1.mint.address
        );

        expect(
          await raydiumUtils.getPoolState(raydiumPool),
          "Raydium pool already created!"
        ).to.be.null;

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.state)
        ).swapFeesToken0;

        expect(
          actualSwapFee.toNumber(),
          "Swap fee calculation mismatch!"
        ).equal(swapTest.swapOutputExpected.swapResult.protocolFee.toNumber());
        expect(
          await dexUtils.dexIsReadyToLaunch(swapTest.dexAccounts.state),
          "Dex not ready to launch!"
        ).equal(true);

        let launchDexArgs = {
          cpSwapProgram: raydiumProgram.programId,
          raydiumAmmConfig: ammConfigAddress,
          raydiumPdaGetter: raydiumUtils.pdaGetter,
          dexAccounts: swapTest.dexAccounts,
          sharedLamports: new BN(LAMPORTS_PER_SOL),
        };

        let launchTx = await dexUtils.launchDex(signer, launchDexArgs);
        await sleep(1000);

        let actualLaunchFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.state)
        ).launchFeesToken0;

        expect(
          actualLaunchFee.toNumber(),
          "Launch fee calculation mismatch!"
        ).equal(expectedLaunchFee.toNumber());

        expect(
          await raydiumUtils.getPoolState(raydiumPool),
          "Raydium pool wasn't created!"
        ).not.to.be.null;
      });
    });

    describe("Swap, vault reserve zero, trade one to zero", () => {
      let swapInputTemplate = new SetupSwapTest(tokenUtils, dexUtils);
      swapInputTemplate.zeroToOne = false;
      let swapOutputTemplate = new SetupSwapTest(tokenUtils, dexUtils);
      swapOutputTemplate.zeroToOne = false;

      it("Should swap base input", async () => {
        let mints = await tokenUtils.initialize2022MintPair(
          signer,
          100_000_000_000,
          100_000_000_000
        );

        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
        );

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );
      });

      it("Should swap base input and not prepared to launch", async () => {
        let mints = await tokenUtils.initialize2022MintPair(
          signer,
          100_000_000,
          100_000_000
        );
        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
        );

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.state
        );
        expect(actual, "Dex ready to launch!").equal(false);
      });

      it("Should swap base input with fee", async () => {
        let mints = await tokenUtils.initialize2022MintPair(
          signer,
          100_000_000,
          100_000_000
        );

        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          mints
        );

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.state)
        ).swapFeesToken1.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapInputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base output", async () => {
        let mints = await tokenUtils.initialize2022MintPair(
          signer,
          100_000_000,
          100_000_000
        );
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints
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

        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.state)
        ).swapFeesToken1.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapOutputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base output and not prepared to launch", async () => {
        let mints = await tokenUtils.initialize2022MintPair(
          signer,
          100_000_000,
          100_000_000
        );
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          mints
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.state
        );
        expect(actual, "Dex ready to launch!").equal(false);
      });
    });
  });
});
