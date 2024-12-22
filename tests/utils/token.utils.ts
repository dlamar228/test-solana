import {
  Connection,
  PublicKey,
  Keypair,
  Signer,
  ConfirmOptions,
  Commitment,
  TransactionSignature,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export interface TokenVault {
  vault: PublicKey;
  mint: Mint;
}

export interface Mint {
  authority: PublicKey;
  freezeAuthority: PublicKey;
  decimals: number;
  address: PublicKey;
  program: PublicKey;
}
export interface MintPair {
  mint0: Mint;
  mint1: Mint;
  ata0: PublicKey;
  ata1: PublicKey;
}

export class TokenUtils {
  connection: Connection;
  confirmOptions: ConfirmOptions;

  constructor(connection: Connection, confirmOptions: ConfirmOptions) {
    this.connection = connection;
    this.confirmOptions = confirmOptions;
  }

  async createSplMint(signer: Signer, decimals: number) {
    const address = await createMint(
      this.connection,
      signer,
      signer.publicKey,
      signer.publicKey,
      decimals,
      Keypair.generate(),
      this.confirmOptions
    );

    return {
      authority: signer.publicKey,
      freezeAuthority: signer.publicKey,
      decimals,
      address,
      program: TOKEN_PROGRAM_ID,
    };
  }

  async createAta(
    signer: Signer,
    owner: PublicKey,
    mint: PublicKey,
    allowOwnerOffCurve = false,
    commitment = "processed" as Commitment
  ) {
    const account = await getOrCreateAssociatedTokenAccount(
      this.connection,
      signer,
      mint,
      owner,
      allowOwnerOffCurve,
      commitment,
      this.confirmOptions
    );
    return account.address;
  }

  async mintTo(
    payer: Signer,
    authority: Signer,
    mint: PublicKey,
    destination: PublicKey,
    amount: number
  ) {
    return await mintTo(
      this.connection,
      payer,
      mint,
      destination,
      authority,
      amount,
      [],
      this.confirmOptions
    );
  }

  sortMintPair(first: Mint, second: Mint) {
    let result = [first, second];
    result.sort((x, y) => {
      const buffer1 = x.address.toBuffer();
      const buffer2 = y.address.toBuffer();

      for (let i = 0; i < buffer1.length && i < buffer2.length; i++) {
        if (buffer1[i] < buffer2[i]) {
          return -1;
        }
        if (buffer1[i] > buffer2[i]) {
          return 1;
        }
      }

      return buffer1.length - buffer2.length;
    });

    return result;
  }

  async initializeSplMintPair(
    signer: Signer,
    amount0: number,
    amount1: number
  ) {
    let [mint0, mint1] = this.sortMintPair(
      await this.createSplMint(signer, 9),
      await this.createSplMint(signer, 9)
    );

    let ata0 = await this.createAta(signer, signer.publicKey, mint0.address);
    let ata1 = await this.createAta(signer, signer.publicKey, mint1.address);

    await this.mintTo(signer, signer, mint0.address, ata0, amount0);
    await this.mintTo(signer, signer, mint1.address, ata1, amount1);

    return {
      mint0,
      mint1,
      ata0,
      ata1,
    };
  }
}
