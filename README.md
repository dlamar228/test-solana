# FAUCET

## Methods

1. **initialize_authority_manage** :
   **Purpose** : Creates a contract authority manager state, which holds admins and the authority to sign transactions. This function must be called after deployment to set the first admin.
   **Parameters** : None. All data is taken from the provided accounts.
   **Returns** : None.
3. **remove_admin** :
   **Purpose** : Removes an admin from the authority manager state. This function can only be called by an admin. If the authority manager state contains only one admin, attempting to remove it will result in an error.
   **Parameters** : The index of the admin in the array.
   **Returns** : None.
4. **set_admin** :
   **Purpose** : Sets or resets an admin in the authority manager state. Only non-default public keys can be set.
   **Parameters** : The index of the admin in the array and the public key of the new admin.
   **Returns** : None.
5. **initialize_faucet_claim** :
   **Purpose** : Creates a new faucet claim state, which is necessary to initialize the faucet with a token. It holds data about the token, the token faucet amount, the start/end times, and the number of shards.
   **Parameters** : The total faucet amount for the claim.
   **Returns** : None.
6. **destroy_faucet_claim** :
   **Purpose** : Destroys the faucet claim state. This function is used to reclaim the rent of the state after the claim period ends.
   **Parameters** : None.
   **Returns** : None.
7. **initialize_faucet_claim_shard** :
   **Purpose** : Creates a new faucet shard for the faucet claim, capable of storing up to 65,535 proofs.
   **Parameters** : The Merkle root to prove the claim.
   **Returns** : None.
8. **destroy_faucet_claim_shard** :
   **Purpose** : Destroys the faucet claim shard state. This function is used to reclaim the rent of the state after the claim period ends.
   **Parameters** : None.
   **Returns** : None.
9. **claim** :
   **Purpose** : Claims tokens from the faucet.
   **Parameters** : Merkle proofs, the index of the leaf, and the amount of tokens.
   **Returns** : None.
10. **withdraw_expired_faucet_claim** :
    **Purpose** : Withdraws the remaining tokens from the faucet. This is allowed only after the claim period ends.
    **Parameters** : None.
    **Returns** : None.
