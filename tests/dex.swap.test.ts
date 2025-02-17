import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Dex } from "../target/types/dex";
import { Faucet } from "../target/types/faucet";
import { Launcher } from "../target/types/launcher";
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
  FaucetUtils,
} from "./utils";
import { expect } from "chai";
import { LauncherUtils } from "./utils/launcher.utils";

describe("dex.swap.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const signer = anchor.Wallet.local().payer;
  const dexProgram = anchor.workspace.Dex as Program<Dex>;
  const faucetProgram = anchor.workspace.Faucet as Program<Faucet>;
  const launcherProgram = anchor.workspace.Launcher as Program<Launcher>;
  const raydiumProgram = createRaydiumProgram(anchor.getProvider());
  const confirmOptions = {
    skipPreflight: true,
  };
  const faucetUtils = new FaucetUtils(faucetProgram, confirmOptions);
  const launcherUtils = new LauncherUtils(launcherProgram, confirmOptions);
  const dexUtils = new DexUtils(dexProgram, confirmOptions);
  const raydiumUtils = new RaydiumUtils(raydiumProgram, confirmOptions);
  const tokenUtils = new TokenUtils(
    anchor.getProvider().connection,
    confirmOptions
  );
  const swapCalculator = new SwapCalculator();

  describe("Spl token", () => {
    describe("SwapBaseInput", () => {
      let swapInputTemplate = new SetupSwapTest(
        tokenUtils,
        dexUtils,
        faucetUtils,
        launcherUtils
      );
      let swapOutputTemplate = new SetupSwapTest(
        tokenUtils,
        dexUtils,
        faucetUtils,
        launcherUtils
      );

      it("Should swap base input", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.dex
        );
        expect(actual, "Dex ready to launch!").equal(false);
      });

      it("Should swap base input and prepared to launch", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer, true);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.dex
        );
        expect(actual, "Dex not ready to launch!").equal(true);
      });

      it("Should swap base input with fee", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actualSwapFee = await swapInputTemplate.getDexSwapFees(
          swapTest.dexAccounts,
          swapTest.zeroToOne
        );

        expect(
          actualSwapFee.toString(),
          "Swap fee calculation mismatch!"
        ).to.deep.equal(
          swapTest.swapInputExpected.swapResult.protocolFee.toString()
        );
      });

      it("Should swap base input with fee and launch", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer, true);

        let launchFeeRate = (
          await dexUtils.getConfigState(swapTest.dexAccounts.config)
        ).launchFeeRate;

        let initDexVaultAmount = await swapInputTemplate.getDexBalance(
          swapTest.dexAccounts,
          swapTest.zeroToOne
        );

        let expectedLaunchFee = swapCalculator.curve.Fee(
          swapTest.swapBaseInputArgs.amountIn
            .add(initDexVaultAmount)
            .sub(swapTest.swapInputExpected.swapResult.protocolFee),
          launchFeeRate
        );

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actualSwapFee = await swapInputTemplate.getDexSwapFees(
          swapTest.dexAccounts,
          swapTest.zeroToOne
        );

        expect(
          actualSwapFee.toString(),
          "Swap fee calculation mismatch!"
        ).to.deep.equal(
          swapTest.swapInputExpected.swapResult.protocolFee.toString()
        );
        expect(
          await dexUtils.dexIsReadyToLaunch(swapTest.dexAccounts.dex),
          "Dex not ready to launch!"
        ).equal(true);

        let [raydiumPool] = raydiumUtils.pdaGetter.getStateAddress(
          ammConfigAddress,
          swapTest.dexAccounts.vaultZero.mint.address,
          swapTest.dexAccounts.vaultOne.mint.address
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

        let actualLaunchFee = await swapInputTemplate.getDexLaunchFees(
          swapTest.dexAccounts,
          swapTest.zeroToOne
        );

        expect(
          actualLaunchFee.toString(),
          "Launch fee calculation mismatch!"
        ).to.deep.equal(expectedLaunchFee.toString());

        expect(
          await raydiumUtils.getPoolState(raydiumPool),
          "Raydium pool wasn't created!"
        ).not.to.be.null;
      });

      // it("Should swap base output", async () => {
      //   let swapTest = await swapOutputTemplate.setupSwapBaseOutput(signer);

      //   let swapTx = await dexUtils.swapBaseOutput(
      //     signer,
      //     swapTest.swapBaseOutputArgs
      //   );
      // });

      /*  it("Should swap base output with fee", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(signer);

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
        ).swapFeesToken0.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapOutputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base output and prepared to launch", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          new BN(2000),
          new BN(500)
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.dex
        );
        expect(actual, "Dex not ready to launch!").equal(true);
      });

      it("Should swap base output with fee and launch", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          new BN(2000),
          new BN(500)
        );

        let launchFeeRate = (
          await dexUtils.getConfigState(swapTest.dexAccounts.config)
        ).launchFeeRate;

        let initAmountZero = await tokenUtils.getBalance(
          swapTest.dexAccounts.vault_zero.address
        );

        let expectedLaunchFee = swapCalculator.curve.Fee(
          swapTest.swapOutputExpected.swapResult.sourceAmountSwapped
            .add(initAmountZero)
            .sub(swapTest.swapOutputExpected.swapResult.protocolFee),
          launchFeeRate
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
        ).swapFeesToken0;

        expect(
          actualSwapFee.toNumber(),
          "Swap fee calculation mismatch!"
        ).equal(swapTest.swapOutputExpected.swapResult.protocolFee.toNumber());
        expect(
          await dexUtils.dexIsReadyToLaunch(swapTest.dexAccounts.dex),
          "Dex not ready to launch!"
        ).equal(true);

        let [raydiumPool] = raydiumUtils.pdaGetter.getStateAddress(
          ammConfigAddress,
          swapTest.dexAccounts.vault_zero.mint.address,
          swapTest.dexAccounts.vault_one.mint.address
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
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
        ).launchFeesToken0;

        expect(
          actualLaunchFee.toNumber(),
          "Launch fee calculation mismatch!"
        ).equal(expectedLaunchFee.toNumber());

        expect(
          await raydiumUtils.getPoolState(raydiumPool),
          "Raydium pool wasn't created!"
        ).not.to.be.null;
      }); */
    });

    /*     describe("Swap, vault reserve zero, trade one to zero", () => {
      let swapInputTemplate = new SetupSwapTest(
        tokenUtils,
        dexUtils,
        faucetUtils,
        launcherUtils
      );
      swapInputTemplate.zeroToOne = false;

      let swapOutputTemplate = new SetupSwapTest(
        tokenUtils,
        dexUtils,
        faucetUtils,
        launcherUtils
      );
      swapOutputTemplate.zeroToOne = false;

      it("Should swap base input", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );
      });

      it("Should swap base input and not prepared to launch", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.dex
        );
        expect(actual, "Dex ready to launch!").equal(false);
      });

      it("Should swap base input with fee", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
        ).swapFeesToken1.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapInputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base output", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(signer);

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );
      });

      it("Should swap base output with fee", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          new BN(2000),
          new BN(500)
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
        ).swapFeesToken1.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapOutputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base output and not prepared to launch", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          new BN(2000),
          new BN(500)
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.dex
        );
        expect(actual, "Dex ready to launch!").equal(false);
      });
    });

    describe("Swap, vault reserve one, trade zero to one", () => {
      let swapInputTemplate = new SetupSwapTest(
        tokenUtils,
        dexUtils,
        faucetUtils,
        launcherUtils
      );
      swapInputTemplate.vaultForReserveBound = true;
      swapInputTemplate.reserveBoundGe = false;

      it("Should swap base input and prepared to launch", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(
          signer,
          new BN(1500),
          new BN(250)
        );

        await dexUtils.swapBaseInput(signer, swapTest.swapBaseInputArgs);
        await sleep(1000);

        await dexUtils.swapBaseInput(signer, swapTest.swapBaseInputArgs);
        await sleep(1000);

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.dex
        );
        expect(actual, "Dex not ready to launch!").equal(true);
      });
    }); */
  });

  /*   describe("Token 2022", () => {  describe("Token 2022", () => {
    describe("Swap, vault reserve zero, trade zero to one", () => {
      let swapInputTemplate = new SetupSwapTest(
        tokenUtils,
        dexUtils,
        faucetUtils,
        launcherUtils
      );

      let swapOutputTemplate = new SetupSwapTest(
        tokenUtils,
        dexUtils,
        faucetUtils,
        launcherUtils
      );

      it("Should swap base input", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );
      });

      it("Should swap base input and prepared to launch", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.dex
        );
        expect(actual, "Dex not ready to launch!").equal(true);
      });

      it("Should swap base input with fee", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
        ).swapFeesToken0.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapInputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base input with fee and launch", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let initAmountZero = await tokenUtils.getBalance(
          swapTest.dexAccounts.vault_zero.address
        );

        let launchFeeRate = (
          await dexUtils.getConfigState(swapTest.dexAccounts.config)
        ).launchFeeRate;

        let expectedLaunchFee = swapCalculator.curve.Fee(
          swapTest.swapBaseInputArgs.amountIn
            .add(initAmountZero)
            .sub(swapTest.swapInputExpected.swapResult.protocolFee),
          launchFeeRate
        );

        let [raydiumPool] = raydiumUtils.pdaGetter.getStateAddress(
          ammConfigAddress,
          swapTest.dexAccounts.vault_zero.mint.address,
          swapTest.dexAccounts.vault_one.mint.address
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
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
        ).swapFeesToken0;

        expect(
          actualSwapFee.toNumber(),
          "Swap fee calculation mismatch!"
        ).equal(swapTest.swapInputExpected.swapResult.protocolFee.toNumber());
        expect(
          await dexUtils.dexIsReadyToLaunch(swapTest.dexAccounts.dex),
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
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
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
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(signer);

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );
      });

      it("Should swap base output with fee", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(signer);

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actualSwapFee = (
          await dexUtils.getConfigState(swapTest.dexAccounts.config)
        ).swapFeeRate.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapOutputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base output and prepared to launch", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          new BN(2000),
          new BN(500)
        );

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.dex
        );
        expect(actual, "Dex not ready to launch!").equal(true);
      });

      it("Should swap base output with fee and launch", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
          signer,
          new BN(2000),
          new BN(500)
        );

        let initAmountZero = await tokenUtils.getBalance(
          swapTest.dexAccounts.vault_zero.address
        );

        let launchFeeRate = (
          await dexUtils.getConfigState(swapTest.dexAccounts.config)
        ).launchFeeRate;

        let expectedLaunchFee = swapCalculator.curve.Fee(
          swapTest.swapOutputExpected.swapResult.sourceAmountSwapped
            .add(initAmountZero)
            .sub(swapTest.swapOutputExpected.swapResult.protocolFee),
          launchFeeRate
        );

        let [raydiumPool] = raydiumUtils.pdaGetter.getStateAddress(
          ammConfigAddress,
          swapTest.dexAccounts.vault_zero.mint.address,
          swapTest.dexAccounts.vault_one.mint.address
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
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
        ).swapFeesToken0;

        expect(
          actualSwapFee.toNumber(),
          "Swap fee calculation mismatch!"
        ).equal(swapTest.swapOutputExpected.swapResult.protocolFee.toNumber());
        expect(
          await dexUtils.dexIsReadyToLaunch(swapTest.dexAccounts.dex),
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
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
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
      let swapInputTemplate = new SetupSwapTest(
        tokenUtils,
        dexUtils,
        faucetUtils,
        launcherUtils
      );
      swapInputTemplate.zeroToOne = false;

      let swapOutputTemplate = new SetupSwapTest(
        tokenUtils,
        dexUtils,
        faucetUtils,
        launcherUtils
      );
      swapOutputTemplate.zeroToOne = false;

      it("Should swap base input", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );
      });

      it("Should swap base input and not prepared to launch", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.dex
        );
        expect(actual, "Dex ready to launch!").equal(false);
      });

      it("Should swap base input with fee", async () => {
        let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

        let swapTx = await dexUtils.swapBaseInput(
          signer,
          swapTest.swapBaseInputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
        ).swapFeesToken1.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapInputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base output", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(signer);

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );
      });

      it("Should swap base output with fee", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(signer);

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actualSwapFee = (
          await dexUtils.getDexState(swapTest.dexAccounts.dex)
        ).swapFeesToken1.toNumber();

        expect(actualSwapFee, "Swap fee calculation mismatch!").eq(
          swapTest.swapOutputExpected.swapResult.protocolFee.toNumber()
        );
      });

      it("Should swap base output and not prepared to launch", async () => {
        let swapTest = await swapOutputTemplate.setupSwapBaseOutput(signer);

        let swapTx = await dexUtils.swapBaseOutput(
          signer,
          swapTest.swapBaseOutputArgs
        );

        let actual = await dexUtils.dexIsReadyToLaunch(
          swapTest.dexAccounts.dex
        );
        expect(actual, "Dex ready to launch!").equal(false);
      });
    });
  }); */
});
