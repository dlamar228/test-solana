import {
  Connection,
  PublicKey,
  Keypair,
  Signer,
  ConfirmOptions,
  Commitment,
  TransactionSignature,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getTransferFeeConfig,
  TransferFeeConfig,
  calculateEpochFee,
  ExtensionType,
  getMintLen,
  createInitializeTransferFeeConfigInstruction,
  createInitializeMintInstruction,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

export interface TokenVault {
  address: PublicKey;
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

  async getBalance(address: PublicKey) {
    let balance = (await this.connection.getTokenAccountBalance(address)).value;
    return new BN(balance.amount);
  }

  async getTransferFeeConfig(mint: PublicKey, program: PublicKey) {
    let mint_data = await getMint(
      this.connection,
      mint,
      this.confirmOptions.commitment,
      program
    );
    let config = getTransferFeeConfig(mint_data);

    return config;
  }

  calculateEpochFee(
    config: TransferFeeConfig,
    epoch: bigint,
    preFeeAmount: bigint
  ) {
    return calculateEpochFee(config, epoch, preFeeAmount);
  }

  async getEpoch() {
    return (await this.connection.getEpochInfo(this.confirmOptions)).epoch;
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

  async create2022MintWithTransferFee(
    signer: Signer,
    decimals: number,
    transferFeeBasisPoints: number,
    maximumFee: bigint
  ): Promise<Mint> {
    let mintKeypair = Keypair.generate();

    const extensions = [ExtensionType.TransferFeeConfig];
    const mintLen = getMintLen(extensions);

    const mintLamports =
      await this.connection.getMinimumBalanceForRentExemption(mintLen);

    const mintTransaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: signer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports: mintLamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeTransferFeeConfigInstruction(
        mintKeypair.publicKey,
        signer.publicKey,
        signer.publicKey,
        transferFeeBasisPoints,
        maximumFee,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        signer.publicKey,
        signer.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(
      this.connection,
      mintTransaction,
      [signer, mintKeypair],
      this.confirmOptions
    );

    return {
      authority: signer.publicKey,
      freezeAuthority: signer.publicKey,
      decimals,
      address: mintKeypair.publicKey,
      program: TOKEN_2022_PROGRAM_ID,
    };
  }

  async createAta(
    signer: Signer,
    owner: PublicKey,
    mint: PublicKey,
    allowOwnerOffCurve = false,
    commitment = "processed" as Commitment,
    program = TOKEN_PROGRAM_ID as PublicKey
  ) {
    const account = await getOrCreateAssociatedTokenAccount(
      this.connection,
      signer,
      mint,
      owner,
      allowOwnerOffCurve,
      commitment,
      this.confirmOptions,
      program
    );
    return account.address;
  }

  async mintTo(
    payer: Signer,
    authority: Signer,
    mint: PublicKey,
    destination: PublicKey,
    amount: number,
    program = TOKEN_PROGRAM_ID
  ): Promise<TransactionSignature> {
    return await mintTo(
      this.connection,
      payer,
      mint,
      destination,
      authority,
      amount,
      [],
      this.confirmOptions,
      program
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
  ): Promise<MintPair> {
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

  async initialize2022MintPair(
    signer: Signer,
    amount0: number,
    amount1: number
  ): Promise<MintPair> {
    let [mint0, mint1] = this.sortMintPair(
      await this.create2022MintWithTransferFee(signer, 9, 50, BigInt(500)),
      await this.create2022MintWithTransferFee(signer, 9, 50, BigInt(500))
    );

    let ata0 = await this.createAta(
      signer,
      signer.publicKey,
      mint0.address,
      false,
      this.confirmOptions.commitment,
      mint0.program
    );
    let ata1 = await this.createAta(
      signer,
      signer.publicKey,
      mint1.address,
      false,
      this.confirmOptions.commitment,
      mint1.program
    );

    await this.mintTo(
      signer,
      signer,
      mint0.address,
      ata0,
      amount0,
      mint0.program
    );
    await this.mintTo(
      signer,
      signer,
      mint1.address,
      ata1,
      amount1,
      mint1.program
    );

    return {
      mint0,
      mint1,
      ata0,
      ata1,
    };
  }
}
