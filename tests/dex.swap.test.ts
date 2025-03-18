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

  describe("dex.swap.test", () => {
    describe("Spl Token", () => {
      describe("SwapBaseInput", () => {
        let swapInputTemplate = new SetupSwapTest(
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
          let swapTest = await swapInputTemplate.setupSwapBaseInput(
            signer,
            true
          );

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

          let actual = await dexUtils.dexIsReadyToLaunch(
            swapTest.dexAccounts.dex
          );
          expect(actual, "Dex ready to launch!").equal(false);
        });

        it("Should swap 5 times base input with fee", async () => {
          let swapTest = await swapInputTemplate.setupSwapBaseInput(signer);

          for (let i = 0; i < 5; i++) {
            let swapFeeBefore = await swapInputTemplate.getDexSwapFees(
              swapTest.dexAccounts,
              swapTest.zeroToOne
            );

            let swapTx = await dexUtils.swapBaseInput(
              signer,
              swapTest.swapBaseInputArgs
            );

            let SwapFeeAfter = await swapInputTemplate.getDexSwapFees(
              swapTest.dexAccounts,
              swapTest.zeroToOne
            );

            let actualSwapFee = SwapFeeAfter.sub(swapFeeBefore);

            expect(
              actualSwapFee.toString(),
              "Swap fee calculation mismatch!"
            ).to.deep.equal(
              swapTest.swapInputExpected.swapResult.protocolFee.toString()
            );

            let actual = await dexUtils.dexIsReadyToLaunch(
              swapTest.dexAccounts.dex
            );
            expect(actual, "Dex ready to launch!").equal(false);
          }
        });

        it("Should swap base input with fee and launch", async () => {
          let swapTest = await swapInputTemplate.setupSwapBaseInput(
            signer,
            true
          );

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
      });

      describe("SwapBaseOutput", () => {
        let swapOutputTemplate = new SetupSwapTest(
          tokenUtils,
          dexUtils,
          faucetUtils,
          launcherUtils
        );

        it("Should swap base output", async () => {
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

        it("Should swap base output with fee", async () => {
          let swapTest = await swapOutputTemplate.setupSwapBaseOutput(signer);

          let swapTx = await dexUtils.swapBaseOutput(
            signer,
            swapTest.swapBaseOutputArgs
          );

          let actualSwapFee = await swapOutputTemplate.getDexSwapFees(
            swapTest.dexAccounts,
            swapTest.zeroToOne
          );

          expect(
            actualSwapFee.toString(),
            "Swap fee calculation mismatch!"
          ).equal(
            swapTest.swapOutputExpected.swapResult.protocolFee.toString()
          );

          let actual = await dexUtils.dexIsReadyToLaunch(
            swapTest.dexAccounts.dex
          );
          expect(actual, "Dex ready to launch!").equal(false);
        });
      });
    });

    describe("Token 2022", () => {
      describe("SwapBaseInput", () => {
        let swapInputTemplate = new SetupSwapTest(
          tokenUtils,
          dexUtils,
          faucetUtils,
          launcherUtils
        );

        it("Should swap base input", async () => {
          let swapTest = await swapInputTemplate.setupSwapBaseInput(
            signer,
            false,
            false
          );

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
          let swapTest = await swapInputTemplate.setupSwapBaseInput(
            signer,
            true,
            false
          );

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
          let swapTest = await swapInputTemplate.setupSwapBaseInput(
            signer,
            false,
            false
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

          let actual = await dexUtils.dexIsReadyToLaunch(
            swapTest.dexAccounts.dex
          );
          expect(actual, "Dex ready to launch!").equal(false);
        });

        it("Should swap 5 times base input with fee", async () => {
          let swapTest = await swapInputTemplate.setupSwapBaseInput(
            signer,
            false,
            false
          );

          for (let i = 0; i < 5; i++) {
            let swapFeeBefore = await swapInputTemplate.getDexSwapFees(
              swapTest.dexAccounts,
              swapTest.zeroToOne
            );

            let swapTx = await dexUtils.swapBaseInput(
              signer,
              swapTest.swapBaseInputArgs
            );

            let SwapFeeAfter = await swapInputTemplate.getDexSwapFees(
              swapTest.dexAccounts,
              swapTest.zeroToOne
            );

            let actualSwapFee = SwapFeeAfter.sub(swapFeeBefore);

            expect(
              actualSwapFee.toString(),
              "Swap fee calculation mismatch!"
            ).to.deep.equal(
              swapTest.swapInputExpected.swapResult.protocolFee.toString()
            );

            let actual = await dexUtils.dexIsReadyToLaunch(
              swapTest.dexAccounts.dex
            );
            expect(actual, "Dex ready to launch!").equal(false);
          }
        });

        it("Should swap base input with fee and launch", async () => {
          let swapTest = await swapInputTemplate.setupSwapBaseInput(
            signer,
            true,
            false
          );

          let launchFeeRate = (
            await dexUtils.getConfigState(swapTest.dexAccounts.config)
          ).launchFeeRate;

          let initDexVaultAmount = await swapInputTemplate.getDexBalance(
            swapTest.dexAccounts,
            swapTest.zeroToOne
          );

          let transferFee = swapCalculator.calculateTransferFee(
            swapTest.swapInputExpected.args.inputMintConfig,
            swapTest.swapInputExpected.args.epoch,
            swapTest.swapBaseInputArgs.amountIn
              .add(initDexVaultAmount)
              .sub(swapTest.swapInputExpected.swapResult.protocolFee)
          );

          let expectedLaunchFee = swapCalculator.curve.Fee(
            swapTest.swapBaseInputArgs.amountIn
              .add(initDexVaultAmount)
              .sub(swapTest.swapInputExpected.swapResult.protocolFee)
              .sub(transferFee.fee),
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
      });

      describe("SwapBaseOutput", () => {
        let swapOutputTemplate = new SetupSwapTest(
          tokenUtils,
          dexUtils,
          faucetUtils,
          launcherUtils
        );

        it("Should swap base output", async () => {
          let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
            signer,
            false,
            false
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

        it("Should swap base output with fee", async () => {
          let swapTest = await swapOutputTemplate.setupSwapBaseOutput(
            signer,
            false,
            false
          );

          let swapTx = await dexUtils.swapBaseOutput(
            signer,
            swapTest.swapBaseOutputArgs
          );

          let actualSwapFee = await swapOutputTemplate.getDexSwapFees(
            swapTest.dexAccounts,
            swapTest.zeroToOne
          );

          expect(
            actualSwapFee.toString(),
            "Swap fee calculation mismatch!"
          ).equal(
            swapTest.swapOutputExpected.swapResult.protocolFee.toString()
          );

          let actual = await dexUtils.dexIsReadyToLaunch(
            swapTest.dexAccounts.dex
          );
          expect(actual, "Dex ready to launch!").equal(false);
        });
      });
    });
  });
});
