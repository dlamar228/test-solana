import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TestChlen } from "../target/types/test_chlen";
import { deposit, getUserAndPoolVaultAmount, setupDepositTest } from "./utils";
import {
  ConfirmOptions,
  Commitment,
  
} from "@solana/web3.js";


async function balance(connection: anchor.web3.Connection, address: anchor.web3.PublicKey) {
  let balance = await connection.getTokenAccountBalance(address);
  console.log("balance.value:", balance.value);
}

describe("deposit test", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const owner = anchor.Wallet.local().payer;

  const program = anchor.workspace.TestChlen as Program<TestChlen>;
  program.provider.connection
  const confirmOptions = {
    commitment: "confirmed" as Commitment,
    preflightCommitment: "confirmed" as Commitment,
  };

  it("deposit test", async () => {
    const cpSwapPoolState = await setupDepositTest(
      program,
      anchor.getProvider().connection,
      owner,
      { transferFeeBasisPoints: 0, MaxFee: 0 }
    );
    
    //console.log("Pool state: ", (await cpSwapPoolState.get_pool_state()).lpAmount.toNumber());

     let dddd = await cpSwapPoolState.get_pool_state();
    
    let asd = await getUserAndPoolVaultAmount(
      owner.publicKey,
      cpSwapPoolState.token0Mint,
      cpSwapPoolState.token0Program,
      cpSwapPoolState.token1Mint,
      cpSwapPoolState.token1Program,
      dddd.vaultA,
      dddd.vaultB,
    );

    console.log("AAA: ",asd);

    const liquidity = new BN(1000000);
    const depositTx = await deposit(
      program,
      owner,
      cpSwapPoolState.ammConfig,
      cpSwapPoolState.token0Mint,
      cpSwapPoolState.token0Program,
      cpSwapPoolState.token1Mint,
      cpSwapPoolState.token1Program,
      liquidity,
      new BN(900000000000000),
      new BN(900000000000000),
      confirmOptions
    );
    console.log("depositTx:", depositTx);

    //await balance(program.provider.connection, depositTx.ownerLpToken);
    //console.log("Pool state: ", (await cpSwapPoolState.get_pool_state()).lpAmount.toNumber());
    let dddd1 = await cpSwapPoolState.get_pool_state();
    
    let asd1 = await getUserAndPoolVaultAmount(
      owner.publicKey,
      cpSwapPoolState.token0Mint,
      cpSwapPoolState.token0Program,
      cpSwapPoolState.token1Mint,
      cpSwapPoolState.token1Program,
      dddd1.vaultA,
      dddd1.vaultB,
    );

    console.log("AAA: ",asd1);
    
  });
});
