import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TestChlen } from "../target/types/test_chlen";
import { Dex } from "../target/types/dex";
import { dex_swap_base_input, dex_swap_base_output, setupDex } from "./utils";
import { assert } from "chai";


describe("dex.swap.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const owner = anchor.Wallet.local().payer;
  console.log("owner: ", owner.publicKey.toString());
  const dex_program = anchor.workspace.Dex as Program<Dex>;
  const proxy_program = anchor.workspace.TestChlen as Program<TestChlen>;

  const confirmOptions = {
    skipPreflight: true,
  };

  var pools;

  it("initialize dex", async () => {
    pools = await setupDex(dex_program, proxy_program, owner);
    await sleep(1000);
    console.log("initialize tx:", pools.dex.tx);
  });

  it("swap base input", async () => {
    const inputToken = pools.dex.state.state.token0Mint;
    const inputTokenProgram = pools.dex.state.state.token0Program;
    
    await sleep(1000);
    let amount_in = new BN(100);
    const baseInTx = await dex_swap_base_input(
      dex_program,
      owner,
      pools.dex.state.state.ammConfig,
      inputToken,
      inputTokenProgram,
      pools.dex.state.state.token1Mint,
      pools.dex.state.state.token1Program,
      amount_in,
      new BN(0),
      pools.raydium.poolAddress,
      pools.raydium.vault0,
      pools.raydium.vault1,
    );
    console.log("baseInputTx:", baseInTx);
  });

  it("swap base output ", async () => {
    const inputToken = pools.dex.state.state.token0Mint;
    const inputTokenProgram = pools.dex.state.state.token0Program;

    await sleep(1000);
    let amount_out = new BN(222);
    const baseOutTx = await dex_swap_base_output(
      dex_program,
      owner,
      pools.dex.state.state.ammConfig,
      inputToken,
      inputTokenProgram,
      pools.dex.state.state.token1Mint,
      pools.dex.state.state.token1Program,
      amount_out,
      new BN(10000000000000),
      pools.raydium.poolAddress,
      pools.raydium.vault0,
      pools.raydium.vault1,
      confirmOptions
    );
    console.log("baseOutputTx:", baseOutTx);
  });

  it("is launched", async () => {
    let state = await pools.dex.state.get_pool_state();
    console.log("state: ", state);
    let isLaunched: boolean =  state.isLaunched;
    assert(isLaunched, "Not launched")
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}