pub mod curve;
pub mod error;
pub mod instructions;
pub mod states;
pub mod utils;

use crate::curve::fees::FEE_RATE_DENOMINATOR_VALUE;
use anchor_lang::prelude::*;
use instructions::*;

declare_id!("7E65apY9nbnCLvhfjCPc4V1veuPriHrp8kD3c76tTr4U");

pub const AUTH_SEED: &str = "vault_and_lp_mint_auth_seed";

#[program]
pub mod dex {
    use curve::MAX_FEE_RATE_VALUE;

    use super::*;

    // The configuation of AMM protocol, include trade fee and protocol fee
    /// # Arguments
    ///
    /// * `ctx`- The accounts needed by instruction.
    /// * `index` - The index of amm config, there may be multiple config.
    /// * `protocol_fee_rate` - The rate of protocol fee.
    ///
    pub fn create_amm_config(
        ctx: Context<CreateAmmConfig>,
        index: u16,
        protocol_fee_rate: u64,
        launch_fee_rate: u64,
    ) -> Result<()> {
        assert!(protocol_fee_rate + launch_fee_rate <= FEE_RATE_DENOMINATOR_VALUE);
        assert!(protocol_fee_rate <= MAX_FEE_RATE_VALUE);
        assert!(launch_fee_rate <= MAX_FEE_RATE_VALUE);
        instructions::create_amm_config(ctx, index, protocol_fee_rate, launch_fee_rate)
    }

    /// Updates the owner of the amm config
    /// Must be called by the current owner or admin
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `protocol_fee_rate`- The new protocol fee rate of amm config, be set when `param` is 0
    /// * `launch_fee_rate`- The new launch fee rate of amm config, be set when `param` is 1
    /// * `new_owner`- The config's new owner, be set when `param` is 2
    /// * `disable_create_pool`- Disable pool creation, be set when `param` is 3
    /// * `param`- The vaule can be 0 | 1 | 2 | 3, otherwise will report a error
    ///
    pub fn update_amm_config(ctx: Context<UpdateAmmConfig>, param: u8, value: u64) -> Result<()> {
        instructions::update_amm_config(ctx, param, value)
    }

    /// Update the reserve bound for pool state
    /// Must be called by the current owner
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `reserve_bound`- The new reserve bound for launch
    ///
    pub fn update_reserve_bound(
        ctx: Context<UpdateReserveBound>,
        reserve_bound: u64,
    ) -> Result<()> {
        instructions::update_reserve_bound(ctx, reserve_bound)
    }

    /// Creates a pool for the given token pair and the initial price
    ///
    /// # Arguments
    ///
    /// * `ctx`- The context of accounts
    /// * `init_amount_0` - the initial amount_0 to deposit
    /// * `init_amount_1` - the initial amount_1 to deposit
    /// * `open_time` - the timestamp allowed for swap
    ///
    pub fn initialize(
        ctx: Context<Initialize>,
        init_amount_0: u64,
        init_amount_1: u64,
        open_time: u64,
        vault_0_reserve_bound: u64,
    ) -> Result<()> {
        instructions::initialize(
            ctx,
            init_amount_0,
            init_amount_1,
            open_time,
            vault_0_reserve_bound,
        )
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
        ctx: Context<CollectProtocolFee>,
        amount_0_requested: u64,
        amount_1_requested: u64,
    ) -> Result<()> {
        instructions::collect_protocol_fee(ctx, amount_0_requested, amount_1_requested)
    }

    /*     /// Transferred tokens to raydium and burt lp tokens
    pub fn launch(ctx: Context<Launch>) -> Result<()> {
        instructions::launch(ctx)
    } */

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
}
