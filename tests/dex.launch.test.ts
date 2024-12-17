import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TestChlen } from "../target/types/test_chlen";
import { Dex } from "../target/types/dex";
import { createDexAmmConfig, initialize, initializeDex, launch, setupDexLaunch, setupInitializeTest, setupInitializeTokens } from "./utils";
import { cpSwapProgram } from "./config";

describe("dex.launch.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const owner = anchor.Wallet.local().payer;
  console.log("owner: ", owner.publicKey.toString());

  const dex_program = anchor.workspace.Dex as Program<Dex>;
  const proxy_program = anchor.workspace.TestChlen as Program<TestChlen>;

  const confirmOptions = {
    skipPreflight: true,
  };

  it("dex.launch.test", async () => {
    let pools = await setupDexLaunch(dex_program,proxy_program,owner);
    
    let dex = {
      program: dex_program,
      vault0: pools.dex.state.state.token0Vault,
      vault1: pools.dex.state.state.token1Vault,
      lp_vault: pools.dex.state.state.tokenLpVault,
      authority: pools.dex.state.authority,
      state: pools.dex.poolStateAddress,
      amm: pools.dex.state.state.ammConfig,
    };

    let radium = {
      program: cpSwapProgram,
      vault0: pools.raydium.vault0,
      vault1: pools.raydium.vault1,
      mint0: pools.dex.state.state.token0Mint,
      mint1: pools.dex.state.state.token1Mint,
      lp_mint: pools.dex.state.state.lpMint,
      authority: pools.raydium.authority,
      state: pools.raydium.poolAddress,
      amm: pools.raydium.cpSwapPoolState.ammConfig,
    };

    let { tx } = await launch(
      owner, dex, radium, confirmOptions
    );
    
    console.log("tx: ", tx.toString());
  });
});
