pub mod curve;
pub mod error;
pub mod instructions;
pub mod states;
pub mod utils;

use anchor_lang::prelude::*;
use instructions::*;

declare_id!("8454oEni7sVVVjS4be7V7d92ShgcjtiRcyDb82vcRmDQ");

#[program]
pub mod dex {

    use super::*;

    pub fn initialize_authority_manager(
        ctx: Context<InitializeAuthorityManager>,
        cpi_authority: Pubkey,
    ) -> Result<()> {
        instructions::initialize_authority_manager(ctx, cpi_authority)
    }

    pub fn update_authority_manager_admin(
        ctx: Context<UpdateAuthorityManager>,
        admin: Pubkey,
    ) -> Result<()> {
        instructions::update_authority_manager_admin(ctx, admin)
    }

    pub fn update_authority_manager_cpi_authority(
        ctx: Context<UpdateAuthorityManager>,
        cpi_authority: Pubkey,
    ) -> Result<()> {
        instructions::update_authority_manager_cpi_authority(ctx, cpi_authority)
    }

    pub fn initialize_config(ctx: Context<InitializeConfigState>) -> Result<()> {
        instructions::initialize_config(ctx)
    }

    pub fn update_config_swap_fee_rate(
        ctx: Context<UpdateConfigState>,
        swap_fee_rate: u64,
    ) -> Result<()> {
        instructions::update_config_swap_fee_rate(ctx, swap_fee_rate)
    }

    pub fn update_config_launch_fee_rate(
        ctx: Context<UpdateConfigState>,
        launch_fee_rate: u64,
    ) -> Result<()> {
        instructions::update_config_launch_fee_rate(ctx, launch_fee_rate)
    }

    pub fn update_config_vault_reserve_bound(
        ctx: Context<UpdateConfigState>,
        vault_reserve_bound: u64,
    ) -> Result<()> {
        instructions::update_config_vault_reserve_bound(ctx, vault_reserve_bound)
    }

    pub fn update_config_initial_reserve(
        ctx: Context<UpdateConfigState>,
        initial_reserve: u64,
    ) -> Result<()> {
        instructions::update_config_initial_reserve(ctx, initial_reserve)
    }

    pub fn withdraw_dex_fee(ctx: Context<WithdrawDexFee>) -> Result<()> {
        instructions::withdraw_dex_fee(ctx)
    }

    pub fn initialize_dex(
        ctx: Context<InitializeDex>,
        init_amount: u64,
        vault_for_reserve_bound: bool,
    ) -> Result<()> {
        instructions::initialize_dex(ctx, init_amount, vault_for_reserve_bound)
    }

    /// Swap the tokens in the pool base input amount
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `amount_in` - input amount to transfer, output to DESTINATION is based on the exchange rate
    /// * `minimum_amount_out` - Minimum amount of output token, prevents excessive slippage
    ///
    pub fn swap_base_input<'info>(
        ctx: Context<'_, '_, '_, 'info, Swap<'info>>,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        instructions::swap_base_input(&ctx, amount_in, minimum_amount_out)
    }

    /// Swap the tokens in the pool base output amount
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `max_amount_in` - input amount prevents excessive slippage
    /// * `amount_out` - amount of output token
    ///
    pub fn swap_base_output<'info>(
        ctx: Context<'_, '_, '_, 'info, Swap<'info>>,
        max_amount_in: u64,
        amount_out: u64,
    ) -> Result<()> {
        instructions::swap_base_output(&ctx, max_amount_in, amount_out)
    }

    pub fn launch_dex(ctx: Context<LaunchDex>, shared_lamports: u64) -> Result<()> {
        instructions::launch_dex(ctx, shared_lamports)
    }
}
