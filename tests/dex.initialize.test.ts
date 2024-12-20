import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { CpProxy } from "../target/types/cp_proxy";
import { Dex } from "../target/types/dex";
import { createDexAmmConfig, initialize, initializeDex, setupInitializeTest, setupInitializeTokens } from "./utils";

describe("dex.initialize.test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const owner = anchor.Wallet.local().payer;
  console.log("owner: ", owner.publicKey.toString());

  const dex_program = anchor.workspace.Dex as Program<Dex>;
  const proxy_program = anchor.workspace.CpProxy as Program<CpProxy>;

  const confirmOptions = {
    skipPreflight: true,
  };

  it("dex.initialize.test", async () => {
    const { configAddress, token0, token0Program, token1, token1Program } =
      await setupInitializeTest(
        anchor.getProvider().connection,
        owner,
        { transferFeeBasisPoints: 0, MaxFee: 0 },
        confirmOptions
      );

    const initAmount0 = new BN(10000000000);
    const initAmount1 = new BN(10000000000);

    const raydium = await initialize(
      proxy_program,
      owner,
      configAddress,
      token0,
      token0Program,
      token1,
      token1Program,
      confirmOptions,
      { initAmount0, initAmount1 }
    );

    console.log("raydium pool address: ", raydium.poolAddress.toString(), "raydium tx:", raydium.tx);

    let amm = await createDexAmmConfig(
      dex_program,
      owner,
      {
        index: 1,
        protocol_fee_rate: new BN(0),
        launch_fee_rate: new BN(0),
      }
    );
    console.log("amm: ", amm);

    let dex = await initializeDex(
      dex_program,
      owner,
      amm.amm,
      token0,
      token0Program,
      token1,
      token1Program,
      {
        pool: raydium.poolAddress,
        lpMint: raydium.lpMint,
      },
      confirmOptions,
      { initAmount0, initAmount1 }
    );

    console.log("dex address: ", dex.poolStateAddress.toString(), " tx:", dex.tx);
    console.log("dex state: ", dex.state);
    

  });
});
