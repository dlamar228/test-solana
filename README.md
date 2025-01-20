# FAUCET

The faucet contract uses Merkle proofs for claims, and only an admin can initialize a new faucet with tokens. Due to Solana's restrictions on account memory allocation, we need to split the faucet claim state into shards. Each shard holds a Merkle proof along with a bit array to track already claimed leaf indices. Since each shard can hold up to 65,535 proofs, you need to create a new state with another Merkle root to add more claims. Each state of the contract requires lamports to cover rent, and the admin can reclaim these lamports after the claim period ends.

## Methods

1. **initialize_authority_manage** :</br>
   **Purpose** : Creates a contract authority manager state, which holds admins and the authority to sign transactions. This function must be called after deployment to set the first admin.</br>
   **Parameters** : None. All data is taken from the provided accounts.</br>
   **Returns** : None.
2. **remove_admin** :</br>
   **Purpose** : Removes an admin from the authority manager state. This function can only be called by an admin. If the authority manager state contains only one admin, attempting to remove it will result in an error.</br>
   **Parameters** : The index of the admin in the array.</br>
   **Returns** : None.
3. **set_admin** :</br>
   **Purpose** : Sets or resets an admin in the authority manager state. Only non-default public keys can be set.</br>
   **Parameters** : The index of the admin in the array and the public key of the new admin.</br>
   **Returns** : None.
4. **initialize_faucet_claim** :</br>
   **Purpose** : Creates a new faucet claim state, which is necessary to initialize the faucet with a token. It holds data about the token, the token faucet amount, the start/end times, and the number of shards.</br>
   **Parameters** : The total faucet amount for the claim.</br>
   **Returns** : None.
5. **destroy_faucet_claim** :</br>
   **Purpose** : Destroys the faucet claim state. This function is used to reclaim the rent of the state after the claim period ends.</br>
   **Parameters** : None.</br>
   **Returns** : None.
6. **initialize_faucet_claim_shard** :</br>
   **Purpose** : Creates a new faucet shard for the faucet claim, capable of storing up to 65,535 proofs.</br>
   **Parameters** : The Merkle root to prove the claim.</br>
   **Returns** : None.
7. **destroy_faucet_claim_shard** :</br>
   **Purpose** : Destroys the faucet claim shard state. This function is used to reclaim the rent of the state after the claim period ends.</br>
   **Parameters** : None.</br>
   **Returns** : None.
8. **claim** :</br>
   **Purpose** : Claims tokens from the faucet.</br>
   **Parameters** : Merkle proofs, the index of the leaf, and the amount of tokens.</br>
   **Returns** : None.
9. **withdraw_expired_faucet_claim** :</br>
   **Purpose** : Withdraws the remaining tokens from the faucet. This is allowed only after the claim period ends.</br>
   **Parameters** : None.</br>
   **Returns** : None.

## Faucet Deploy

Cretae *.so files in traget/deploy run: `cargo build-sbf` </br>
Sync program keys run: `anchor keys sync` </br>
Deploy faucet contract run: `solana program deploy --program-id ./target/deploy/faucet-keypair.json ./target/deploy/faucet.so --url localhost`
