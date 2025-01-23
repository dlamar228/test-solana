use super::*;

use crate::curve::MAX_FEE_RATE_VALUE;
use crate::error::ErrorCode;
use crate::states::*;

pub fn initialize_config(ctx: Context<InitializeConfigState>) -> Result<()> {
    let config_id = ctx.accounts.config.key();
    let config = &mut ctx.accounts.config;
    config.bump = ctx.bumps.config;
    config.swap_fee_rate = 10_000;
    config.launch_fee_rate = 10_000;
    config.initial_reserve = 2 * 10u64.pow(9);
    config.vault_reserve_bound = 205_000_000 * 10u64.pow(9);

    emit!(InitializeConfigEvent {
        admin_id: ctx.accounts.payer.key(),
        config_id,
        swap_fee_rate: config.swap_fee_rate,
        launch_fee_rate: config.launch_fee_rate,
        initial_reserve: config.initial_reserve,
        vault_reserve_bound: config.vault_reserve_bound,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfigState<'info> {
    #[account(mut, address = authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [
            DEX_AUTHORITY_MANAGER_SEED.as_bytes()
        ],
        bump = authority_manager.bump,
    )]
    pub authority_manager: Account<'info, AuthorityManager>,
    #[account(
        init,
        seeds = [
            DEX_CONFIG_SEED.as_bytes()
        ],
        bump,
        payer = payer,
        space = ConfigState::LEN
    )]
    pub config: Account<'info, ConfigState>,
    pub system_program: Program<'info, System>,
}

pub fn update_swap_fee_rate(ctx: Context<UpdateConfigState>, swap_fee_rate: u64) -> Result<()> {
    assert!(swap_fee_rate <= MAX_FEE_RATE_VALUE);

    let config = &mut ctx.accounts.config;
    let old_swap_fee_rate = config.swap_fee_rate;
    config.swap_fee_rate = swap_fee_rate;

    emit!(UpdateConfigSwapFeeRateEvent {
        admin_id: ctx.accounts.payer.key(),
        old_swap_fee_rate,
        new_swap_fee_rate: swap_fee_rate,
    });

    Ok(())
}

pub fn update_launch_fee_rate(ctx: Context<UpdateConfigState>, launch_fee_rate: u64) -> Result<()> {
    assert!(launch_fee_rate <= MAX_FEE_RATE_VALUE);

    let config = &mut ctx.accounts.config;
    let old_launch_fee_rate = config.launch_fee_rate;
    config.launch_fee_rate = launch_fee_rate;

    emit!(UpdateConfigLaunchFeeRateEvent {
        admin_id: ctx.accounts.payer.key(),
        old_launch_fee_rate,
        new_launch_fee_rate: launch_fee_rate,
    });

    Ok(())
}

pub fn update_vault_reserve_bound(
    ctx: Context<UpdateConfigState>,
    vault_reserve_bound: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old_vault_reserve_bound = config.vault_reserve_bound;
    config.vault_reserve_bound = vault_reserve_bound;

    emit!(UpdateConfigVaultReserveBoundEvent {
        admin_id: ctx.accounts.payer.key(),
        old_vault_reserve_bound,
        new_vault_reserve_bound: vault_reserve_bound,
    });

    Ok(())
}

pub fn update_initial_reserve(ctx: Context<UpdateConfigState>, initial_reserve: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old_initial_reserve = config.initial_reserve;
    config.initial_reserve = initial_reserve;

    emit!(UpdateConfigInitialReserveEvent {
        admin_id: ctx.accounts.payer.key(),
        old_initial_reserve,
        new_initial_reserve: initial_reserve,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfigState<'info> {
    #[account(mut, address = authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEX_CONFIG_SEED.as_bytes(),],
        bump = config.bump
    )]
    pub config: Box<Account<'info, ConfigState>>,
    #[account(
        seeds = [DEX_AUTHORITY_MANAGER_SEED.as_bytes(),],
        bump = authority_manager.bump
    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
}
