pub mod curve;
pub mod error;
pub mod instructions;
pub mod states;
pub mod utils;

use crate::curve::fees::FEE_RATE_DENOMINATOR_VALUE;
use anchor_lang::prelude::*;
use instructions::*;

declare_id!("7E65apY9nbnCLvhfjCPc4V1veuPriHrp8kD3c76tTr4U");

#[program]
pub mod dex {
    use curve::MAX_FEE_RATE_VALUE;

    use super::*;

    // The protocol of dex, include admin
    /// # Arguments
    ///
    /// * `ctx`- The accounts needed by instruction.
    ///
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
        instructions::initialize_protocol(ctx)
    }

    // The configuration, include admin
    /// # Arguments
    ///
    /// * `ctx`- The accounts needed by instruction.
    /// * `index` - The index of config, there may be multiple config.
    ///
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        admin: Pubkey,
        index: u16,
    ) -> Result<()> {
        instructions::initialize_config(ctx, admin, index)
    }

    /// Updates the admin of the config
    /// Must be called by the current admin
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `new_admin`- The new admin
    ///
    pub fn update_config_admin(ctx: Context<UpdateConfigState>, new_admin: Pubkey) -> Result<()> {
        instructions::update_config_admin(ctx, new_admin)
    }

    /// Updates the `disable_create_dex` of the config
    /// Must be called by the current admin
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `disable_or_enable`- The new flag of dex creation
    ///
    pub fn update_create_dex(
        ctx: Context<UpdateConfigState>,
        disable_or_enable: bool,
    ) -> Result<()> {
        instructions::update_create_dex(ctx, disable_or_enable)
    }

    /// Collect the protocol fee
    ///
    /// # Arguments
    ///
    /// * `ctx` - The context of accounts
    /// * `amount_0_requested` - The maximum amount of token_0 to send, can be 0 to collect fees in only token_1
    /// * `amount_1_requested` - The maximum amount of token_1 to send, can be 0 to collect fees in only token_0
    ///
    pub fn collect_protocol_fee(
        ctx: Context<CollectFee>,
        amount_0_requested: u64,
        amount_1_requested: u64,
    ) -> Result<()> {
        instructions::collect_fee(ctx, amount_0_requested, amount_1_requested)
    }

    /// Creates a dex for the given token pair and the initial price
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `init_amount_0` - the initial amount_0 to deposit
    /// * `init_amount_1` - the initial amount_1 to deposit
    /// * `open_time` - the timestamp allowed for swap
    /// * `vault_0_reserve_bound` - the bound if reserve to launch
    /// * `swap_fee_rate` - the swap fee rate
    /// * `launch_fee_rate` - the launch fee rate
    ///
    pub fn initialize_dex(
        ctx: Context<InitializeDex>,
        init_amount_0: u64,
        init_amount_1: u64,
        open_time: u64,
        vault_for_reserve_bound: bool,
        reserve_bound_ge: bool,
        vault_reserve_bound: u64,
        swap_fee_rate: u64,
        launch_fee_rate: u64,
    ) -> Result<()> {
        assert!(swap_fee_rate + launch_fee_rate <= FEE_RATE_DENOMINATOR_VALUE);
        assert!(swap_fee_rate <= MAX_FEE_RATE_VALUE);
        assert!(launch_fee_rate <= MAX_FEE_RATE_VALUE);
        instructions::initialize_dex(
            ctx,
            init_amount_0,
            init_amount_1,
            open_time,
            vault_for_reserve_bound,
            reserve_bound_ge,
            vault_reserve_bound,
            swap_fee_rate,
            launch_fee_rate,
        )
    }

    /// Update the reserve bound for dex state
    /// Must be called by the current admin
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `reserve_bound`- The new reserve bound for launch
    ///
    pub fn update_reserve_bound(ctx: Context<UpdateDexState>, reserve_bound: u64) -> Result<()> {
        instructions::update_reserve_bound(ctx, reserve_bound)
    }

    /// Update the swap fee rate for dex state
    /// Must be called by the current admin
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `swap_fee_rate`- The new swap fee rate
    ///
    pub fn update_swap_fee_rate(ctx: Context<UpdateDexState>, swap_fee_rate: u64) -> Result<()> {
        instructions::update_swap_fee_rate(ctx, swap_fee_rate)
    }

    /// Update the launch fee rate for dex state
    /// Must be called by the current admin
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `launch_fee_rate`- The new launch fee rate
    ///
    pub fn update_launch_fee_rate(
        ctx: Context<UpdateDexState>,
        launch_fee_rate: u64,
    ) -> Result<()> {
        instructions::update_launch_fee_rate(ctx, launch_fee_rate)
    }

    /// Swap the tokens in the pool base input amount
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `amount_in` -  input amount to transfer, output to DESTINATION is based on the exchange rate
    /// * `minimum_amount_out` -  Minimum amount of output token, prevents excessive slippage
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
    /// * `max_amount_in` -  input amount prevents excessive slippage
    /// * `amount_out` -  amount of output token
    ///
    pub fn swap_base_output<'info>(
        ctx: Context<'_, '_, '_, 'info, Swap<'info>>,
        max_amount_in: u64,
        amount_out: u64,
    ) -> Result<()> {
        instructions::swap_base_output(&ctx, max_amount_in, amount_out)
    }

    pub fn launch(ctx: Context<Launch>) -> Result<()> {
        instructions::launch_dex(ctx)
    }

    pub fn refund_dex_auth(ctx: Context<RefundDexAuth>) -> Result<()> {
        instructions::refund_dex_auth(ctx)
    }
}
