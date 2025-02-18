# SUMMURY
The purpose of the project is to create a faucet and a DEX to collect liquidity for the creation of a standard Raydium AMM. To reach this was written 3 contracts:
1. **Launcher**: This is the main contract that enables anyone to create a Dex with a pair of two token mints. It mints tokens for teams and the faucet, while the remaining tokens are supplied to the Dex. 
2. **Dex**: This is the main contract that enables anyone to create a Dex with a pair of two token mints. It mints tokens for teams and the faucet, while the remaining tokens are supplied to the Dex.
3. **Faucet**: This contract provides an option for airdrops.

To run on localhost for test with deployed contract do: `./localhost_solana_test_validator.sh`. Script will build contract, load raydium and token meta accounts and run solana test validator with logs in `validator.log` and `transaction.log` files. 

# LAUNCHER
The Launcher contract manage Dex creation, token mint creation for Dex and how much tokens will get Dex, team and Faucet. The passed tokens will be sorted. Contract does not store used mints, created Dex. Instead, someone must parse events to obtain this data.

## METHODS
- **initialize_authority_manager** :</br>
   **Purpose** : Creates a contract authority manager state, which holds admins and the authority to sign transactions. This function must be called after deployment to set the first admin.</br>
   **Parameters** : Pubkey of faucet authority to transfer faucet tokens.</br>
   **Event** :
   ```rust
    pub struct InitializeAuthorityManagerEvent {
        #[index]
        pub authority_manager_id: Pubkey,
        #[index]
        pub admin_id: Pubkey,
    }
   ```
   **Returns** : None.</br>
- **update_authority_manager_admin** :</br>
   **Purpose** : Removes an admin from the authority manager state. This function can only be called by an admin.</br>
   **Parameters** : New admin Pubkey.</br>
   **Event** :
   ```rust
    pub struct UpdateAuthorityManagerAdminEvent {
        #[index]
        pub old_admin_id: Pubkey,
        #[index]
        pub new_admin_id: Pubkey,
    }
   ```
   **Returns** : None.</br>
- **update_authority_manager_faucet_authority** :</br>
   **Purpose** : Update faucet authority.</br>
   **Parameters** : Pubkey of new faucet authority to transfer faucet tokens.</br>
   **Event** :
   ```rust
    pub struct UpdateAuthorityManagerFaucetAuthorityEvent {
        #[index]
        pub old_faucet_authority_id: Pubkey,
        #[index]
        pub new_faucet_authority_id: Pubkey,
    }
   ```
   **Returns** : None.</br>
- **withdraw_team_tokens** :</br>
   **Purpose** : Obtain team tokens from team vault.</br>
   **Parameters** : None.</br>
   **Event** :
   ```rust
    pub struct WithdrawTeamTokensEvent {
        #[index]
        pub admin_id: Pubkey,
        #[index]
        pub mint_id: Pubkey,
        pub recipient_id: Pubkey,
        pub amount: u64,
    }
   ```
   **Returns** : None.</br>
- **initialize_config** :</br>
   **Purpose** : Hold settings how much tokens will get a team and a faucet.</br>
   **Parameters** : None.</br>
   **Event** :
   ```rust
    pub struct InitializeConfigEvent {
        #[index]
        pub config_id: Pubkey,
        #[index]
        pub admin_id: Pubkey,
        pub team_tokens: u64,
        pub faucet_tokens: u64,
    }
   ```
   **Returns** : None.</br>
- **update_config_team_tokens** :</br>
   **Purpose** : Update team tokens.</br>
   **Parameters** : New team tokens.</br>
   **Event** :
   ```rust
    pub struct UpdateConfigTeamTokensEvent {
        #[index]
        pub admin_id: Pubkey,
        pub old_team_tokens: u64,
        pub new_team_tokens: u64,
    }
   ```
   **Returns** : None.</br>
- **update_config_faucet_tokens** :</br>
   **Purpose** : Update faucet tokens.</br>
   **Parameters** : New faucet tokens.</br>
   **Event** :
   ```rust
    pub struct UpdateConfigFaucetTokensEvent {
        #[index]
        pub admin_id: Pubkey,
        pub old_faucet_tokens: u64,
        pub new_faucet_tokens: u64,
    }
   ```
   **Returns** : None.</br>
- **cpi_initialize_dex** :</br>
   **Purpose** : Create new dex.</br>
   **Parameters** : None.</br>
   **Event** :
   ```rust
    pub struct InitializeDexWithFaucetEvent {
        #[index]
        pub dex_id: Pubkey,
        pub payer_id: Pubkey,
        pub mint_zero_id: Pubkey,
        pub mint_one_id: Pubkey,
        pub team_tokens_amount: u64,
        pub faucet_tokens_amount: u64,
    }
   ```
   **Returns** : None.</br>
- **cpi_initialize_dex_with_faucet** :</br>
   **Purpose** : Create new dex with faucet.</br>
   **Parameters** : None.</br>
   **Event** :
   ```rust
      pub struct InitializeDexWithFaucetEvent {
         #[index]
         pub dex_id: Pubkey,
         pub payer_id: Pubkey,
         pub mint_zero_id: Pubkey,
         pub mint_one_id: Pubkey,
         pub team_tokens_amount: u64,
         pub faucet_tokens_amount: u64,
      }
   ```
  **Returns** : None.</br>
- **initialize_mint** :</br>
   **Purpose** : Create new token mint with launcher authority.</br>
   **Parameters** : Token name, symbol and uri.</br>
   **Event** : None.</br>
   **Returns** : None.</br>

## DEPLOY
Sync program keys run: `anchor keys sync` </br>
Create *.so files in target/deploy run: `cargo build-sbf` </br>
Deploy Dex contract run: `solana program deploy --program-id ./target/deploy/launcher-keypair.json ./target/deploy/launcher.so --url localhost`

# DEX
The Dex contract allows swaps using SPL and Token2022 interfaces. Only mints with extensions such as TransferFeeConfig, MetadataPointer, and TokenMetadata are permitted. When the vault reserve threshold is reached, swaps are halted, and the contract waits for the admin to launch and create a Raydium AMM.

## METHODS
- **initialize_authority_manager** :</br>
   **Purpose** : Creates a contract authority manager state, which holds admins and the authority to sign transactions. This function must be called after deployment to set the first admin.</br>
   **Parameters** : Pubkey of cpi authority to call dex creation.</br>
   **Event** :
   ```rust
   pub struct InitializeAuthorityManagerEvent {
      #[index]
      pub authority_manager_id: Pubkey,
      #[index]
      pub admin_id: Pubkey,
      pub cpi_authority_id: Pubkey,
   }
   ```
   **Returns** : None.</br>
- **update_authority_manager_admin** :</br>
   **Purpose** : Removes an admin from the authority manager state. This function can only be called by an admin.</br>
   **Parameters** : New admin Pubkey.</br>
   **Event** :
   ```rust
    pub struct UpdateAuthorityManagerAdminEvent {
        #[index]
        pub old_admin_id: Pubkey,
        #[index]
        pub new_admin_id: Pubkey,
    }
   ```
   **Returns** : None.</br>
- **update_authority_manager_cpi_authority** :</br>
   **Purpose** : Update cpu authority.</br>
   **Parameters** : New cpi authority Pubkey.</br>
   **Event** :
   ```rust
      pub struct UpdateAuthorityManagerCpiAuthorityEvent {
         #[index]
         pub old_cpi_authority_id: Pubkey,
         #[index]
         pub new_cpi_authority_id: Pubkey,
      }
   ```
   **Returns** : None.</br>
- **initialize_config** :</br>
   **Purpose** : Create config which hold data like swap fee, launch fee, initial reserve and vault reserve bound.</br>
   **Parameters** : None.</br>
   **Event** :
   ```rust
      pub struct InitializeConfigEvent {
         #[index]
         pub admin_id: Pubkey,
         #[index]
         pub config_id: Pubkey,
         pub swap_fee_rate: u64,
         pub launch_fee_rate: u64,
         pub initial_reserve: u64,
         pub vault_reserve_bound: u64,
      }
   ```
   **Returns** : None.</br>
- **update_config_swap_fee_rate** :</br>
   **Purpose** : Set new swap fee rate for all dex.</br>
   **Parameters** : New swap fee rate.</br>
   **Event** :
   ```rust
      pub struct UpdateConfigSwapFeeRateEvent {
         #[index]
         pub admin_id: Pubkey,
         pub old_swap_fee_rate: u64,
         pub new_swap_fee_rate: u64,
      }
   ```
   **Returns** : None.</br>
- **update_config_launch_fee_rate** :</br>
   **Purpose** : Set new launch fee rate for all dex.</br>
   **Parameters** : New launch fee rate.</br>
   **Event** :
   ```rust
      pub struct UpdateConfigLaunchFeeRateEvent {
         #[index]
         pub admin_id: Pubkey,
         pub old_launch_fee_rate: u64,
         pub new_launch_fee_rate: u64,
      }
   ```
   **Returns** : None.</br>
- **update_config_vault_reserve_bound** :</br>
   **Purpose** : Set new reserve bound to launch dex.</br>
   **Parameters** : New vault reserve bound.</br>
   **Event** :
   ```rust
      pub struct UpdateConfigVaultReserveBoundEvent {
         #[index]
         pub admin_id: Pubkey,
         pub old_vault_reserve_bound: u64,
         pub new_vault_reserve_bound: u64,
      }
   ```
   **Returns** : None.</br>
- **update_config_initial_reserve** :</br>
   **Purpose** : Set new initial reserve.</br>
   **Parameters** : New initial reserve.</br>
   **Event** :
   ```rust
      pub struct UpdateConfigInitialReserveEvent {
         #[index]
         pub admin_id: Pubkey,
         pub old_initial_reserve: u64,
         pub new_initial_reserve: u64,
      }
   ```
   **Returns** : None.</br>
- **withdraw_dex_fee** :</br>
   **Purpose** : Withdraw all swap fees and launch fees for dex.</br>
   **Parameters** : None.</br>
   **Event** :
   ```rust
      pub struct WithdrawDexFeeEvent {
         #[index]
         pub admin_id: Pubkey,
         #[index]
         pub dex_id: Pubkey,
         pub token_zero_amount: u64,
         pub token_one_amount: u64,
      }
   ```
   **Returns** : None.</br>
- **initialize_dex** :</br>
   **Purpose** : Create new Dex state. Can be called only by cpi authority.</br>
   **Parameters** : Init token amount, dex vault for reserve bound and which reserve bound condition to use.</br>
   **Event** :
   ```rust
      pub struct InitializeDexEvent {
         #[index]
         pub dex_id: Pubkey,
         pub payer_id: Pubkey,
         pub mint_zero: Pubkey,
         pub mint_one: Pubkey,
         pub token_zero_amount: u64,
         pub token_one_amount: u64,
         pub reserve_bound: u64,
         pub vault_for_reserve_bound: bool,
      }
   ```
   **Returns** : None.</br>
- **swap_base_input** :</br>
   **Purpose** : Do swap. If reach vault reserve bound set new Dex state.</br>
   **Parameters** : Input amount to transfer and minimum amount of output token, prevents excessive slippage.</br>
   **Event** :
   ```rust
      pub struct SwapEvent {
         #[index]
         pub dex_id: Pubkey,
         pub input_vault_before: u64,
         pub output_vault_before: u64,
         pub input_amount: u64,
         pub output_amount: u64,
         pub input_transfer_fee: u64,
         pub output_transfer_fee: u64,
         pub remaining_tokens: u64,
         pub base_input: bool,
         pub zero_to_one: bool,
      }
      pub struct DexIsReadyToLaunchEvent {
         #[index]
         pub dex_id: Pubkey,
      }
   ```
   **Returns** : None.</br>
- **swap_base_output** :</br>
   **Purpose** : Do swap. If reach vault reserve bound set new Dex state.</br>
   **Parameters** : Input amount prevents excessive slippage and amount of output token.</br>
   **Event** :
   ```rust
      pub struct SwapEvent {
         #[index]
         pub dex_id: Pubkey,
         pub input_vault_before: u64,
         pub output_vault_before: u64,
         pub input_amount: u64,
         pub output_amount: u64,
         pub input_transfer_fee: u64,
         pub output_transfer_fee: u64,
         pub remaining_tokens: u64,
         pub base_input: bool,
         pub zero_to_one: bool,
      }
      pub struct DexIsReadyToLaunchEvent {
         #[index]
         pub dex_id: Pubkey,
      }
   ```
   **Returns** : None.</br>
- **launch_dex** :</br>
   **Purpose** : Create standard Raydium AMM, calculate launch fee and burn LP tokens.</br>
   **Parameters** : Shared lamports to send authority. Used to pay for standard Raydium AMM creation.</br>
   **Event** :
   ```rust
      pub struct DexLaunchedEvent {
         #[index]
         pub dex_id: Pubkey,
         #[index]
         pub raydium_id: Pubkey,
         #[index]
         pub admin_id: Pubkey,
         pub amount_0: u64,
         pub amount_1: u64,
         pub launch_fees_0: u64,
         pub launch_fees_1: u64,
         pub transfer_fee_0: u64,
         pub transfer_fee_1: u64,
         pub lp_burned: u64,
      }
   ```
   **Returns** : None.</br>

## DEPLOY
Sync program keys run: `anchor keys sync` </br>
Create *.so files in target/deploy run: `cargo build-sbf` </br>
Deploy Dex contract run: `solana program deploy --program-id ./target/deploy/dex-keypair.json ./target/deploy/dex.so --url localhost`


# FAUCET
The faucet contract uses Merkle proofs for claims, and only an admin can initialize a new faucet with tokens. Due to Solana's restrictions on account memory allocation, we need to split the faucet claim state into shards. Each shard holds a Merkle proof along with a bit array to track already claimed leaf indices. Since each shard can hold up to 65,535 proofs, you need to create a new state with another Merkle root to add more claims. Each state of the contract requires lamports to cover rent, and the admin can reclaim these lamports after the claim period ends.</br>

The Faucet contract does not store used mints, created faucet claims, or faucet claim shards due to the high cost. Instead, someone must parse events to obtain this data. Additionally, the Faucet operates independently and does not rely on any other contracts.

## METHODS
- **initialize_authority_manager** :</br>
   **Purpose** : Creates a contract authority manager state, which holds admins and the authority to sign transactions. This function must be called after deployment to set the first admin.</br>
   **Parameters** : None. All data is taken from the provided accounts.</br>
   **Event** :
   ```rust
    pub struct InitializeAuthorityManagerEvent {
      #[index]
      pub authority_manager_id: Pubkey,
      #[index]
      pub admin_id: Pubkey,
    }
   ```
   **Returns** : None.</br>
- **remove_admin** :</br>
   **Purpose** : Removes an admin from the authority manager state. This function can only be called by an admin. If the authority manager state contains only one admin, attempting to remove it will result in an error.</br>
   **Parameters** : The index of the admin in the array.</br>
   **Event** :
   ```rust
    pub struct RemoveAuthorityManagerAdminEvent {
      #[index]
      pub admin_id: Pubkey,
      pub removed_admin_id: Pubkey,
    }
   ```
   **Returns** : None.</br>
- **set_admin** :</br>
   **Purpose** : Sets or resets an admin in the authority manager state. Only non-default public keys can be set.</br>
   **Parameters** : The index of the admin in the array and the public key of the new admin.</br>
   **Event** :
   ```rust
    pub struct SetAuthorityManagerAdminEvent {
        #[index]
        pub admin_id: Pubkey,
        pub set_admin_id: Pubkey,
    }
   ```
   **Returns** : None.</br>
- **initialize_faucet_claim** :</br>
   **Purpose** : Creates a new faucet claim state, which is necessary to initialize the faucet with a token. It holds data about the token, the token faucet amount, the start/end times, and the number of shards.</br>
   **Parameters** : The total faucet amount for the claim.</br>
   **Event** :
   ```rust
    pub struct InitializeFaucetClaimEvent {
        #[index]
        pub faucet_claim_id: Pubkey,
        #[index]
        pub mint_id: Pubkey,
        pub total_faucet_amount: u64,
    }
   ```
   **Returns** : None.</br>
- **destroy_faucet_claim** :</br>
   **Purpose** : Destroys the faucet claim state. This function is used to reclaim the rent of the state after the claim period ends.</br>
   **Parameters** : None.</br>
   **Event** :
   ```rust
    pub struct DestroyFaucetClaimEvent {
        #[index]
        pub admin_id: Pubkey,
        #[index]
        pub faucet_claim_id: Pubkey,
    }
   ```
   **Returns** : None.</br>
- **initialize_faucet_claim_shard** :</br>
   **Purpose** : Creates a new faucet shard for the faucet claim, capable of storing up to 65,535 proofs.</br>
   **Parameters** : The Merkle root to prove the claim.</br>
   **Event** :
   ```rust
    pub struct InitializeFaucetClaimShardEvent {
        #[index]
        pub admin_id: Pubkey,
        #[index]
        pub faucet_claim_id: Pubkey,
        pub faucet_claim_shard_id: Pubkey,
        pub merkle_root: [u8; 32],
    }
   ```
   **Returns** : None.</br>
- **destroy_faucet_claim_shard** :</br>
   **Purpose** : Destroys the faucet claim shard state. This function is used to reclaim the rent of the state after the claim period ends.</br>
   **Parameters** : None.</br>
   **Event** :
   ```rust
    pub struct DestroyFaucetClaimShardEvent {
        #[index]
        pub admin_id: Pubkey,
        #[index]
        pub faucet_claim_id: Pubkey,
        pub faucet_claim_shard_id: Pubkey,
    }
   ```
   **Returns** : None.</br>
- **claim** :</br>
   **Purpose** : Claims tokens from the faucet.</br>
   **Parameters** : Merkle proofs, the index of the leaf, and the amount of tokens.</br>
   **Event** :
   ```rust
    pub struct ClaimEvent {
        #[index]
        pub address_id: Pubkey,
        #[index]
        pub mint_id: Pubkey,
        pub amount: u64,
    }
   ```
   **Returns** : None.</br>
- **withdraw_expired_faucet_claim** :</br>
   **Purpose** : Withdraws the remaining tokens from the faucet. This is allowed only after the claim period ends.</br>
   **Parameters** : None.</br>
   **Event** :
   ```rust
    pub struct WithdrawExpiredFaucetClaimEvent {
        #[index]
        pub faucet_claim_id: Pubkey,
        #[index]
        pub mint_id: Pubkey,
        pub amount: u64,
    }
   ```
   **Returns** : None.</br>

## DEPLOY
Sync program keys run: `anchor keys sync` </br>
Create *.so files in target/deploy run: `cargo build-sbf` </br>
Deploy Faucet contract run: `solana program deploy --program-id ./target/deploy/faucet-keypair.json ./target/deploy/faucet.so --url localhost`
