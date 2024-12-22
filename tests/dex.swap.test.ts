import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Dex } from "../target/types/dex";
import {
  DexUtils,
  TokenUtils,
  createRaydiumProgram,
  RaydiumUtils,
  ammConfigAddress,
  sleep,
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
        protocol_fee_rate: new BN(0),
        launch_fee_rate: new BN(0),
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
        inputVault: dexAccounts.vault0.vault,
        outputVault: dexAccounts.vault1.vault,
        amountIn: new BN(1000),
        minimumAmountOut: new BN(100),
        raydiumAccounts,
        dexAccounts,
      };
      let swap_tx = await dexUtils.swap_base_input(signer, swapArgs);
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
        protocol_fee_rate: new BN(0),
        launch_fee_rate: new BN(0),
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

      let before = await dexUtils.is_launched(dexAccounts.state);
      expect(before, "Dex already launched!").not.equal(true);

      let swapArgs = {
        inputToken: dexAccounts.vault0.mint.address,
        inputTokenProgram: dexAccounts.vault0.mint.program,
        outputToken: dexAccounts.vault1.mint.address,
        outputTokenProgram: dexAccounts.vault1.mint.program,
        inputAta: ata0,
        outputAta: ata1,
        inputVault: dexAccounts.vault0.vault,
        outputVault: dexAccounts.vault1.vault,
        amountIn: new BN(1000),
        minimumAmountOut: new BN(100),
        raydiumAccounts,
        dexAccounts,
      };
      let swap_tx = await dexUtils.swap_base_input(signer, swapArgs);

      let after = await dexUtils.is_launched(dexAccounts.state);
      expect(after, "Dex not launched!").equal(true);
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
        protocol_fee_rate: new BN(0),
        launch_fee_rate: new BN(0),
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
        inputVault: dexAccounts.vault0.vault,
        outputVault: dexAccounts.vault1.vault,
        maxAmountIn: new BN(1000),
        amountOutLessFee: new BN(1250),
        raydiumAccounts,
        dexAccounts,
      };
      let swap_tx = await dexUtils.swap_base_output(signer, swapArgs);
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
        protocol_fee_rate: new BN(0),
        launch_fee_rate: new BN(0),
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

      let before = await dexUtils.is_launched(dexAccounts.state);
      expect(before, "Dex already launched!").not.equal(true);

      let swapArgs = {
        inputToken: dexAccounts.vault0.mint.address,
        inputTokenProgram: dexAccounts.vault0.mint.program,
        outputToken: dexAccounts.vault1.mint.address,
        outputTokenProgram: dexAccounts.vault1.mint.program,
        inputAta: ata0,
        outputAta: ata1,
        inputVault: dexAccounts.vault0.vault,
        outputVault: dexAccounts.vault1.vault,
        maxAmountIn: new BN(1000),
        amountOutLessFee: new BN(1250),
        raydiumAccounts,
        dexAccounts,
      };
      let swap_tx = await dexUtils.swap_base_output(signer, swapArgs);

      let after = await dexUtils.is_launched(dexAccounts.state);
      expect(after, "Dex not launched!").equal(true);
    });
  });
});
